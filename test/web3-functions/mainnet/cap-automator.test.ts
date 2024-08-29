import hre from 'hardhat'
import { expect } from 'chai'
import { Contract } from '@ethersproject/contracts'
import { Web3FunctionHardhat } from '@gelatonetwork/web3-functions-sdk/hardhat-plugin'
import { Web3FunctionResultCallData } from '@gelatonetwork/web3-functions-sdk/*'
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'
import { SnapshotRestorer, impersonateAccount, takeSnapshot, mine } from '@nomicfoundation/hardhat-network-helpers'

import { capAutomatorAbi, erc20Abi, poolAbi, protocolDataProviderAbi } from '../../../abis'
import { addresses, insistOnExecution } from '../../../utils'

const { w3f, ethers } = hre

describe('CapAutomator', function () {
    this.timeout(0)

    let cleanStateRestorer: SnapshotRestorer
    let snapshotRestorer: SnapshotRestorer

    let capAutomatorW3F: Web3FunctionHardhat
    let reader: SignerWithAddress
    let keeper: SignerWithAddress

    let capAutomator: Contract
    let protocolDataProvider: Contract
    let pool: Contract

    let sparkAssets: string[]

    let userArgs = {
        threshold: 5000,
        performGasCheck: false,
        sendSlackMessages: false,
    }

    const { reth, weth, wsteth } = addresses.mainnet

    const rethWhale = '0x7C5aaA2a20b01df027aD032f7A768aC015E77b86' as const
    const wstethWhale = '0x3c22ec75ea5D745c78fc84762F7F1E6D82a2c5BF' as const

    const supply = async (signerAddress: string, tokenAddress: string, amount: BigInt) => {
        await impersonateAccount(signerAddress)
        const signer = await hre.ethers.getSigner(signerAddress)

        const token = new Contract(tokenAddress, erc20Abi, signer)

        await insistOnExecution(() => token.approve(addresses.mainnet.pool, amount))

        const pool = new Contract(addresses.mainnet.pool, poolAbi, signer)
        await insistOnExecution(() => pool.supply(tokenAddress, amount, signerAddress, 0))
    }

    const withdraw = async (signerAddress: string, tokenAddress: string, amount: BigInt) => {
        await impersonateAccount(signerAddress)
        const signer = await hre.ethers.getSigner(signerAddress)

        const pool = new Contract(addresses.mainnet.pool, poolAbi, signer)
        await insistOnExecution(() => pool.withdraw(tokenAddress, amount, signerAddress))
    }

    const borrow = async (signerAddress: string, tokenAddress: string, amount: BigInt) => {
        await impersonateAccount(signerAddress)
        const signer = await hre.ethers.getSigner(signerAddress)

        const pool = new Contract(addresses.mainnet.pool, poolAbi, signer)
        await insistOnExecution(() => pool.borrow(tokenAddress, amount, 2, 0, signerAddress))
    }

    const repay = async (signerAddress: string, tokenAddress: string, amount: BigInt) => {
        await impersonateAccount(signerAddress)
        const signer = await hre.ethers.getSigner(signerAddress)

        const token = new Contract(tokenAddress, erc20Abi, signer)

        await insistOnExecution(() => token.approve(addresses.mainnet.pool, amount))

        const pool = new Contract(addresses.mainnet.pool, poolAbi, signer)
        await insistOnExecution(() => pool.repay(tokenAddress, amount, 2, signerAddress))
    }

    const formatExecSupplyCallData = (assetAddress: string) =>
        `0xb00d4b1c000000000000000000000000${assetAddress.slice(2).toLocaleLowerCase()}`

    const formatExecBorrowCallData = (assetAddress: string) =>
        `0xb1ae9f48000000000000000000000000${assetAddress.slice(2).toLocaleLowerCase()}`

    const formatExecCallData = (assetAddress: string) =>
        `0x6bb6126e000000000000000000000000${assetAddress.slice(2).toLocaleLowerCase()}`

    before(async () => {
        cleanStateRestorer = await takeSnapshot()

        capAutomatorW3F = w3f.get('cap-automator')
        await capAutomatorW3F.run('onRun', { userArgs })
        ;[reader, keeper] = await ethers.getSigners()

        pool = new Contract(addresses.mainnet.pool, poolAbi, reader)
        capAutomator = new Contract(addresses.mainnet.capAutomator, capAutomatorAbi, reader)
        protocolDataProvider = new Contract(addresses.mainnet.protocolDataProvider, protocolDataProviderAbi, reader)

        sparkAssets = await pool.getReservesList()

        for (const assetAddress of sparkAssets) {
            await insistOnExecution(() => capAutomator.exec(assetAddress))
        }

        await mine(2, { interval: 24 * 60 * 60 })
    })

    beforeEach(async () => {
        snapshotRestorer = await takeSnapshot()
    })

    afterEach(async () => {
        await snapshotRestorer.restore()
    })

    after(async () => {
        await cleanStateRestorer.restore()
    })

    it('no cap updates are required', async () => {
        const { result } = await capAutomatorW3F.run('onRun', { userArgs })

        expect(result.canExec).to.equal(false)
        !result.canExec && expect(result.message).to.equal('No cap automator calls to be executed')
    })

    describe('execSupply', () => {
        const testedThresholds = [3000, 5000, 7000, 9000]

        testedThresholds.forEach((threshold) => {
            userArgs.threshold = threshold

            describe(`${threshold / 100}% threshold`, () => {
                it(`actual gap is smaller than optimal but the threshold is not met`, async () => {
                    const { gap } = await capAutomator.supplyCapConfigs(reth)

                    const percentageOfTheGapTooSmallToTrigger = (10000 - threshold) / 100

                    // full tokens * reth decimals * percentage of the gap
                    const amountInFullTokens = (BigInt(gap) * BigInt(percentageOfTheGapTooSmallToTrigger)) / BigInt(100)

                    // supplying only 1/4 of the full amount
                    await supply(rethWhale, reth, amountInFullTokens * BigInt(10 ** 18))

                    const { result } = await capAutomatorW3F.run('onRun', { userArgs: { ...userArgs, threshold } })

                    expect(result.canExec).to.equal(false)
                    !result.canExec && expect(result.message).to.equal('No cap automator calls to be executed')
                })

                it(`one supply cap increase is required`, async () => {
                    const { gap } = await capAutomator.supplyCapConfigs(reth)

                    const percentageOfTheGapNeededForTrigger = (10000 - threshold) / 100 + 1

                    // full tokens * reth decimals * percentage of the gap
                    const amountInFullTokens = (BigInt(gap) * BigInt(percentageOfTheGapNeededForTrigger)) / BigInt(100)

                    // supplying only 1/4 of the full supply amount
                    await supply(rethWhale, reth, (amountInFullTokens * BigInt(10 ** 18)) / BigInt(4))

                    const { result: negativeResult } = await capAutomatorW3F.run('onRun', {
                        userArgs: { ...userArgs, threshold },
                    })

                    expect(negativeResult.canExec).to.equal(false)

                    // supplying remaining of the full supply amount
                    await supply(rethWhale, reth, (amountInFullTokens * BigInt(10 ** 18) * BigInt(3)) / BigInt(4))

                    const { result: positiveResult } = await capAutomatorW3F.run('onRun', {
                        userArgs: { ...userArgs, threshold },
                    })

                    expect(positiveResult.canExec).to.equal(true)
                    if (!positiveResult.canExec) {
                        throw ''
                    }

                    const callData = positiveResult.callData as Web3FunctionResultCallData[]

                    expect(callData.length).to.equal(1)

                    expect(callData[0].to).to.equal(addresses.mainnet.capAutomator)
                    expect(callData[0].data).to.equal(formatExecSupplyCallData(reth))

                    const supplyCapBefore = BigInt((await protocolDataProvider.getReserveCaps(reth)).supplyCap)

                    await insistOnExecution(() =>
                        keeper.sendTransaction({
                            to: callData[0].to,
                            data: callData[0].data,
                        }),
                    )

                    const supplyCapAfter = BigInt((await protocolDataProvider.getReserveCaps(reth)).supplyCap)

                    expect(supplyCapAfter).to.equal(supplyCapBefore + amountInFullTokens)
                })

                it(`one supply cap decrease is required`, async () => {
                    const { gap } = await capAutomator.supplyCapConfigs(reth)

                    const percentageOfTheGapNeededForTrigger = (10000 - threshold) / 100 + 1

                    // full tokens * reth decimals * percentage of the gap
                    const amountInFullTokens = (BigInt(gap) * BigInt(percentageOfTheGapNeededForTrigger)) / BigInt(100)

                    // supplying only 1/4 of the full supply amount
                    await supply(rethWhale, reth, amountInFullTokens * BigInt(10 ** 18))

                    await insistOnExecution(() => capAutomator.exec(reth))

                    await withdraw(rethWhale, reth, amountInFullTokens * BigInt(10 ** 18))

                    const { result: positiveResult } = await capAutomatorW3F.run('onRun', {
                        userArgs: { ...userArgs, threshold },
                    })

                    expect(positiveResult.canExec).to.equal(true)
                    if (!positiveResult.canExec) {
                        throw ''
                    }

                    const callData = positiveResult.callData as Web3FunctionResultCallData[]

                    expect(callData.length).to.equal(1)

                    expect(callData[0].to).to.equal(addresses.mainnet.capAutomator)
                    expect(callData[0].data).to.equal(formatExecSupplyCallData(reth))

                    const supplyCapBefore = BigInt((await protocolDataProvider.getReserveCaps(reth)).supplyCap)

                    await insistOnExecution(() =>
                        keeper.sendTransaction({
                            to: callData[0].to,
                            data: callData[0].data,
                        }),
                    )

                    const supplyCapAfter = BigInt((await protocolDataProvider.getReserveCaps(reth)).supplyCap)

                    expect(supplyCapAfter).to.equal(supplyCapBefore - amountInFullTokens)
                })

                it('two supply cap updates are required', async () => {
                    const { gap: wstethGap } = await capAutomator.supplyCapConfigs(wsteth)
                    const { gap: rethGap } = await capAutomator.supplyCapConfigs(reth)

                    const percentageOfTheGapNeededForTrigger = (10000 - threshold) / 100 + 1

                    const wstethAmountInFullTokens =
                        (BigInt(wstethGap) * BigInt(percentageOfTheGapNeededForTrigger)) / BigInt(100)
                    const rethAmountInFullTokens =
                        (BigInt(rethGap) * BigInt(percentageOfTheGapNeededForTrigger)) / BigInt(100)

                    await supply(wstethWhale, wsteth, wstethAmountInFullTokens * BigInt(10 ** 18))
                    await insistOnExecution(() => capAutomator.exec(wsteth))

                    await withdraw(wstethWhale, wsteth, wstethAmountInFullTokens * BigInt(10 ** 18))
                    await supply(rethWhale, reth, rethAmountInFullTokens * BigInt(10 ** 18))

                    const { result } = await capAutomatorW3F.run('onRun', { userArgs: { ...userArgs, threshold } })

                    expect(result.canExec).to.equal(true)
                    if (!result.canExec) {
                        throw ''
                    }

                    const callData = result.callData as Web3FunctionResultCallData[]

                    expect(callData.length).to.equal(2)

                    expect(callData[0].to).to.equal(addresses.mainnet.capAutomator)
                    expect(callData[0].data).to.equal(formatExecSupplyCallData(wsteth))

                    expect(callData[1].to).to.equal(addresses.mainnet.capAutomator)
                    expect(callData[1].data).to.equal(formatExecSupplyCallData(reth))

                    const wstethSupplyCapBefore = BigInt((await protocolDataProvider.getReserveCaps(wsteth)).supplyCap)
                    const rethSupplyCapBefore = BigInt((await protocolDataProvider.getReserveCaps(reth)).supplyCap)

                    await Promise.all(
                        callData.map(async (txData) => {
                            await insistOnExecution(() =>
                                keeper.sendTransaction({
                                    to: txData.to,
                                    data: txData.data,
                                }),
                            )
                        }),
                    )

                    const wstethSupplyCapAfter = BigInt((await protocolDataProvider.getReserveCaps(wsteth)).supplyCap)
                    const rethSupplyCapAfter = BigInt((await protocolDataProvider.getReserveCaps(reth)).supplyCap)

                    expect(wstethSupplyCapAfter).to.equal(wstethSupplyCapBefore - wstethAmountInFullTokens)
                    expect(rethSupplyCapAfter).to.equal(rethSupplyCapBefore + rethAmountInFullTokens)
                })
            })
        })
    })

    describe('execBorrow', () => {
        beforeEach(async () => {
            await supply(wstethWhale, wsteth, BigInt(40000) * BigInt(10 ** 18))
            await supply(rethWhale, reth, BigInt(400) * BigInt(10 ** 18))
            await insistOnExecution(() => capAutomator.execSupply(wsteth))
            await insistOnExecution(() => capAutomator.execSupply(reth))
            await mine(2, { interval: 24 * 60 * 60 })
        })

        const testedThresholds = [3000, 5000, 7000, 9000]

        testedThresholds.forEach((threshold) => {
            userArgs.threshold = threshold

            describe(`${threshold / 100}% threshold`, () => {
                it(`actual gap is smaller than optimal but the threshold is not met`, async () => {
                    const { gap } = await capAutomator.borrowCapConfigs(wsteth)

                    const percentageOfTheGapTooSmallToTrigger = (10000 - threshold) / 100

                    const amountInFullTokens = (BigInt(gap) * BigInt(percentageOfTheGapTooSmallToTrigger)) / BigInt(100)

                    // borrowing only 1/4 of the full amount
                    await borrow(rethWhale, wsteth, (amountInFullTokens * BigInt(10 ** 18)) / BigInt(4))

                    const { result } = await capAutomatorW3F.run('onRun', { userArgs: { ...userArgs, threshold } })

                    expect(result.canExec).to.equal(false)
                    !result.canExec && expect(result.message).to.equal('No cap automator calls to be executed')
                })

                it('one borrow cap increase is required', async () => {
                    const { gap } = await capAutomator.borrowCapConfigs(wsteth)

                    const percentageOfTheGapNeededForTrigger = (10000 - threshold) / 100 + 1

                    const amountInFullTokens = (BigInt(gap) * BigInt(percentageOfTheGapNeededForTrigger)) / BigInt(100)

                    // borrowing only 1/4 of the full borrow amount
                    await borrow(rethWhale, wsteth, (amountInFullTokens * BigInt(10 ** 18)) / BigInt(4))

                    const { result: negativeResult } = await capAutomatorW3F.run('onRun', {
                        userArgs: { ...userArgs, threshold },
                    })

                    expect(negativeResult.canExec).to.equal(false)

                    // borrowing remaining of the full supply amount
                    await borrow(rethWhale, wsteth, (amountInFullTokens * BigInt(10 ** 18) * BigInt(3)) / BigInt(4))

                    const { result: positiveResult } = await capAutomatorW3F.run('onRun', {
                        userArgs: { ...userArgs, threshold },
                    })

                    expect(positiveResult.canExec).to.equal(true)
                    if (!positiveResult.canExec) {
                        throw ''
                    }

                    const callData = positiveResult.callData as Web3FunctionResultCallData[]

                    expect(callData.length).to.equal(1)

                    expect(callData[0].to).to.equal(addresses.mainnet.capAutomator)
                    expect(callData[0].data).to.equal(formatExecBorrowCallData(wsteth))

                    const borrowCapBefore = BigInt((await protocolDataProvider.getReserveCaps(wsteth)).borrowCap)

                    await insistOnExecution(() =>
                        keeper.sendTransaction({
                            to: callData[0].to,
                            data: callData[0].data,
                        }),
                    )

                    const borrowCapAfter = BigInt((await protocolDataProvider.getReserveCaps(wsteth)).borrowCap)

                    expect(borrowCapAfter).to.equal(borrowCapBefore + amountInFullTokens)
                })

                it('one borrow cap decrease is required', async () => {
                    const { gap } = await capAutomator.borrowCapConfigs(wsteth)

                    const percentageOfTheGapNeededForTrigger = (10000 - threshold) / 100 + 1

                    const amountInFullTokens = (BigInt(gap) * BigInt(percentageOfTheGapNeededForTrigger)) / BigInt(100)

                    // borrowing only 1/4 of the full borrow amount
                    await borrow(rethWhale, wsteth, amountInFullTokens * BigInt(10 ** 18))

                    await insistOnExecution(() => capAutomator.exec(wsteth))

                    await repay(rethWhale, wsteth, amountInFullTokens * BigInt(10 ** 18))

                    const { result: positiveResult } = await capAutomatorW3F.run('onRun', {
                        userArgs: { ...userArgs, threshold },
                    })

                    expect(positiveResult.canExec).to.equal(true)
                    if (!positiveResult.canExec) {
                        throw ''
                    }

                    const callData = positiveResult.callData as Web3FunctionResultCallData[]

                    expect(callData.length).to.equal(1)

                    expect(callData[0].to).to.equal(addresses.mainnet.capAutomator)
                    expect(callData[0].data).to.equal(formatExecBorrowCallData(wsteth))

                    const borrowCapBefore = BigInt((await protocolDataProvider.getReserveCaps(wsteth)).borrowCap)

                    await insistOnExecution(() =>
                        keeper.sendTransaction({
                            to: callData[0].to,
                            data: callData[0].data,
                        }),
                    )

                    const borrowCapAfter = BigInt((await protocolDataProvider.getReserveCaps(wsteth)).borrowCap)

                    expect(borrowCapAfter).to.equal(borrowCapBefore - amountInFullTokens)
                })

                it('two borrow cap updates are required', async () => {
                    const { gap: wethGap } = await capAutomator.borrowCapConfigs(weth)
                    const { gap: wstethGap } = await capAutomator.borrowCapConfigs(wsteth)

                    const percentageOfTheGapNeededForTrigger = (10000 - threshold) / 100 + 1

                    const wethAmountInFullTokens =
                        (BigInt(wethGap) * BigInt(percentageOfTheGapNeededForTrigger)) / BigInt(100)
                    const wstethAmountInFullTokens =
                        (BigInt(wstethGap) * BigInt(percentageOfTheGapNeededForTrigger)) / BigInt(100)

                    await borrow(wstethWhale, weth, wethAmountInFullTokens * BigInt(10 ** 18))
                    await insistOnExecution(() => capAutomator.exec(weth))

                    await repay(wstethWhale, weth, wethAmountInFullTokens * BigInt(10 ** 18))
                    await borrow(rethWhale, wsteth, wstethAmountInFullTokens * BigInt(10 ** 18))

                    const { result } = await capAutomatorW3F.run('onRun', { userArgs: { ...userArgs, threshold } })

                    expect(result.canExec).to.equal(true)
                    if (!result.canExec) {
                        throw ''
                    }

                    const callData = result.callData as Web3FunctionResultCallData[]

                    expect(callData.length).to.equal(2)

                    expect(callData[0].to).to.equal(addresses.mainnet.capAutomator)
                    expect(callData[0].data).to.equal(formatExecBorrowCallData(weth))

                    expect(callData[1].to).to.equal(addresses.mainnet.capAutomator)
                    expect(callData[1].data).to.equal(formatExecBorrowCallData(wsteth))

                    const wethBorrowCapBefore = BigInt((await protocolDataProvider.getReserveCaps(weth)).borrowCap)
                    const wstethBorrowCapBefore = BigInt((await protocolDataProvider.getReserveCaps(wsteth)).borrowCap)

                    await Promise.all(
                        callData.map(async (txData) => {
                            await insistOnExecution(() =>
                                keeper.sendTransaction({
                                    to: txData.to,
                                    data: txData.data,
                                }),
                            )
                        }),
                    )

                    const wethBorrowCapAfter = BigInt((await protocolDataProvider.getReserveCaps(weth)).borrowCap)
                    const wstethBorrowCapAfter = BigInt((await protocolDataProvider.getReserveCaps(wsteth)).borrowCap)

                    // After initial cap setting, when fast forwarding time, some interest is accrued and added to capAfter
                    expect(Number(wethBorrowCapAfter)).to.be.greaterThanOrEqual(
                        Number(wethBorrowCapBefore - wethAmountInFullTokens),
                    )
                    expect(Number(wethBorrowCapAfter)).to.be.lessThanOrEqual(
                        Number(((wethBorrowCapBefore - wethAmountInFullTokens) * BigInt(100015)) / BigInt(100000)),
                    )
                    expect(wstethBorrowCapAfter).to.equal(wstethBorrowCapBefore + wstethAmountInFullTokens)
                })
            })
        })
    })

    describe('exec', () => {
        const testedThresholds = [3000, 5000, 7000, 9000]

        testedThresholds.forEach((threshold) => {
            describe(`${threshold / 100}% threshold`, () => {
                userArgs.threshold = threshold

                it('one exec is required (increase)', async () => {
                    const { gap: supplyGap } = await capAutomator.supplyCapConfigs(wsteth)
                    const { gap: borrowGap } = await capAutomator.borrowCapConfigs(wsteth)

                    const percentageOfTheGapNeededForTrigger = (10000 - threshold) / 100 + 1

                    const supplyAmountInFullTokens =
                        (BigInt(supplyGap) * BigInt(percentageOfTheGapNeededForTrigger)) / BigInt(100)
                    const borrowAmountInFullTokens =
                        (BigInt(borrowGap) * BigInt(percentageOfTheGapNeededForTrigger)) / BigInt(100)

                    await supply(rethWhale, reth, BigInt(400) * BigInt(10 ** 18))
                    await insistOnExecution(() => capAutomator.execSupply(reth))

                    await supply(wstethWhale, wsteth, supplyAmountInFullTokens * BigInt(10 ** 18))
                    await borrow(rethWhale, wsteth, borrowAmountInFullTokens * BigInt(10 ** 18))

                    const { result: positiveResult } = await capAutomatorW3F.run('onRun', {
                        userArgs: { ...userArgs, threshold },
                    })

                    expect(positiveResult.canExec).to.equal(true)
                    if (!positiveResult.canExec) {
                        throw ''
                    }

                    const callData = positiveResult.callData as Web3FunctionResultCallData[]

                    expect(callData.length).to.equal(1)

                    expect(callData[0].to).to.equal(addresses.mainnet.capAutomator)
                    expect(callData[0].data).to.equal(formatExecCallData(wsteth))

                    const supplyCapBefore = BigInt((await protocolDataProvider.getReserveCaps(wsteth)).supplyCap)
                    const borrowCapBefore = BigInt((await protocolDataProvider.getReserveCaps(wsteth)).borrowCap)

                    await insistOnExecution(() =>
                        keeper.sendTransaction({
                            to: callData[0].to,
                            data: callData[0].data,
                        }),
                    )

                    const supplyCapAfter = BigInt((await protocolDataProvider.getReserveCaps(wsteth)).supplyCap)
                    const borrowCapAfter = BigInt((await protocolDataProvider.getReserveCaps(wsteth)).borrowCap)

                    expect(supplyCapAfter).to.equal(supplyCapBefore + supplyAmountInFullTokens)
                    expect(borrowCapAfter).to.equal(borrowCapBefore + borrowAmountInFullTokens)
                })

                it('one exec is required (decrease)', async () => {
                    const { gap: supplyGap } = await capAutomator.supplyCapConfigs(wsteth)
                    const { gap: borrowGap } = await capAutomator.borrowCapConfigs(wsteth)

                    const percentageOfTheGapNeededForTrigger = (10000 - threshold) / 100 + 1

                    const supplyAmountInFullTokens =
                        (BigInt(supplyGap) * BigInt(percentageOfTheGapNeededForTrigger)) / BigInt(100)
                    const borrowAmountInFullTokens =
                        (BigInt(borrowGap) * BigInt(percentageOfTheGapNeededForTrigger)) / BigInt(100)

                    await supply(rethWhale, reth, BigInt(400) * BigInt(10 ** 18))
                    await insistOnExecution(() => capAutomator.execSupply(reth))

                    await supply(wstethWhale, wsteth, supplyAmountInFullTokens * BigInt(10 ** 18))
                    await borrow(rethWhale, wsteth, borrowAmountInFullTokens * BigInt(10 ** 18))
                    await insistOnExecution(() => capAutomator.exec(wsteth))

                    await withdraw(wstethWhale, wsteth, supplyAmountInFullTokens * BigInt(10 ** 18))
                    await repay(rethWhale, wsteth, borrowAmountInFullTokens * BigInt(10 ** 18))

                    const { result: positiveResult } = await capAutomatorW3F.run('onRun', {
                        userArgs: { ...userArgs, threshold },
                    })

                    expect(positiveResult.canExec).to.equal(true)
                    if (!positiveResult.canExec) {
                        throw ''
                    }

                    const callData = positiveResult.callData as Web3FunctionResultCallData[]

                    expect(callData.length).to.equal(1)

                    expect(callData[0].to).to.equal(addresses.mainnet.capAutomator)
                    expect(callData[0].data).to.equal(formatExecCallData(wsteth))

                    const supplyCapBefore = BigInt((await protocolDataProvider.getReserveCaps(wsteth)).supplyCap)
                    const borrowCapBefore = BigInt((await protocolDataProvider.getReserveCaps(wsteth)).borrowCap)

                    await insistOnExecution(() =>
                        keeper.sendTransaction({
                            to: callData[0].to,
                            data: callData[0].data,
                        }),
                    )

                    const supplyCapAfter = BigInt((await protocolDataProvider.getReserveCaps(wsteth)).supplyCap)
                    const borrowCapAfter = BigInt((await protocolDataProvider.getReserveCaps(wsteth)).borrowCap)

                    expect(supplyCapAfter).to.equal(supplyCapBefore - supplyAmountInFullTokens)
                    expect(borrowCapAfter).to.equal(borrowCapBefore - borrowAmountInFullTokens)
                })

                it('two execs are required', async () => {
                    const percentageOfTheGapNeededForTrigger = (10000 - threshold) / 100 + 1

                    const { gap: wstethSupplyGap } = await capAutomator.supplyCapConfigs(wsteth)
                    const { gap: wstethBorrowGap } = await capAutomator.borrowCapConfigs(wsteth)

                    const wstethSupplyAmountInFullTokens =
                        (BigInt(wstethSupplyGap) * BigInt(percentageOfTheGapNeededForTrigger)) / BigInt(100)
                    const wstethBorrowAmountInFullTokens =
                        (BigInt(wstethBorrowGap) * BigInt(percentageOfTheGapNeededForTrigger)) / BigInt(100)

                    const { gap: rethSupplyGap } = await capAutomator.supplyCapConfigs(reth)
                    const { gap: rethBorrowGap } = await capAutomator.borrowCapConfigs(reth)

                    const rethSupplyAmountInFullTokens =
                        (BigInt(rethSupplyGap) * BigInt(percentageOfTheGapNeededForTrigger)) / BigInt(100)
                    const rethBorrowAmountInFullTokens =
                        (BigInt(rethBorrowGap) * BigInt(percentageOfTheGapNeededForTrigger)) / BigInt(100)

                    await supply(wstethWhale, wsteth, wstethSupplyAmountInFullTokens * BigInt(10 ** 18))
                    await supply(rethWhale, reth, rethSupplyAmountInFullTokens * BigInt(10 ** 18))

                    await borrow(rethWhale, wsteth, wstethBorrowAmountInFullTokens * BigInt(10 ** 18))
                    await borrow(wstethWhale, reth, rethBorrowAmountInFullTokens * BigInt(10 ** 18))

                    const { result: positiveResult } = await capAutomatorW3F.run('onRun', {
                        userArgs: { ...userArgs, threshold },
                    })

                    expect(positiveResult.canExec).to.equal(true)
                    if (!positiveResult.canExec) {
                        throw ''
                    }

                    const callData = positiveResult.callData as Web3FunctionResultCallData[]

                    expect(callData.length).to.equal(2)

                    expect(callData[0].to).to.equal(addresses.mainnet.capAutomator)
                    expect(callData[0].data).to.equal(formatExecCallData(wsteth))
                    expect(callData[1].to).to.equal(addresses.mainnet.capAutomator)
                    expect(callData[1].data).to.equal(formatExecCallData(reth))

                    const wstethSupplyCapBefore = BigInt((await protocolDataProvider.getReserveCaps(wsteth)).supplyCap)
                    const wstethBorrowCapBefore = BigInt((await protocolDataProvider.getReserveCaps(wsteth)).borrowCap)

                    const rethSupplyCapBefore = BigInt((await protocolDataProvider.getReserveCaps(reth)).supplyCap)
                    const rethBorrowCapBefore = BigInt((await protocolDataProvider.getReserveCaps(reth)).borrowCap)

                    await Promise.all(
                        callData.map(async (txData) => {
                            await insistOnExecution(() =>
                                keeper.sendTransaction({
                                    to: txData.to,
                                    data: txData.data,
                                }),
                            )
                        }),
                    )

                    const wstethSupplyCapAfter = BigInt((await protocolDataProvider.getReserveCaps(wsteth)).supplyCap)
                    const wstethBorrowCapAfter = BigInt((await protocolDataProvider.getReserveCaps(wsteth)).borrowCap)

                    const rethSupplyCapAfter = BigInt((await protocolDataProvider.getReserveCaps(reth)).supplyCap)
                    const rethBorrowCapAfter = BigInt((await protocolDataProvider.getReserveCaps(reth)).borrowCap)

                    expect(wstethSupplyCapAfter).to.equal(wstethSupplyCapBefore + wstethSupplyAmountInFullTokens)
                    expect(wstethBorrowCapAfter).to.equal(wstethBorrowCapBefore + wstethBorrowAmountInFullTokens)

                    expect(rethSupplyCapAfter).to.equal(rethSupplyCapBefore + rethSupplyAmountInFullTokens)
                    expect(rethBorrowCapAfter).to.equal(rethBorrowCapBefore + rethBorrowAmountInFullTokens)
                })

                it('all types of operations are required', async () => {
                    const percentageOfTheGapNeededForTrigger = (10000 - threshold) / 100 + 1

                    const { gap: wstethSupplyGap } = await capAutomator.supplyCapConfigs(wsteth)
                    const { gap: wstethBorrowGap } = await capAutomator.borrowCapConfigs(wsteth)

                    const wstethSupplyAmountInFullTokens =
                        (BigInt(wstethSupplyGap) * BigInt(percentageOfTheGapNeededForTrigger)) / BigInt(100)
                    const wstethBorrowAmountInFullTokens =
                        (BigInt(wstethBorrowGap) * BigInt(percentageOfTheGapNeededForTrigger)) / BigInt(100)

                    const { gap: rethSupplyGap } = await capAutomator.supplyCapConfigs(reth)

                    const rethSupplyAmountInFullTokens =
                        (BigInt(rethSupplyGap) * BigInt(percentageOfTheGapNeededForTrigger)) / BigInt(100)

                    const { gap: wethBorrowGap } = await capAutomator.borrowCapConfigs(weth)

                    const wethBorrowAmountInFullTokens =
                        (BigInt(wethBorrowGap) * BigInt(percentageOfTheGapNeededForTrigger)) / BigInt(100)

                    await supply(rethWhale, reth, rethSupplyAmountInFullTokens * BigInt(10 ** 18))
                    await supply(wstethWhale, wsteth, wstethSupplyAmountInFullTokens * BigInt(10 ** 18))

                    await borrow(rethWhale, wsteth, wstethBorrowAmountInFullTokens * BigInt(10 ** 18))
                    await borrow(wstethWhale, weth, wethBorrowAmountInFullTokens * BigInt(10 ** 18))

                    const { result: positiveResult } = await capAutomatorW3F.run('onRun', {
                        userArgs: { ...userArgs, threshold },
                    })

                    expect(positiveResult.canExec).to.equal(true)
                    if (!positiveResult.canExec) {
                        throw ''
                    }

                    const callData = positiveResult.callData as Web3FunctionResultCallData[]

                    expect(callData.length).to.equal(3)

                    expect(callData[0].to).to.equal(addresses.mainnet.capAutomator)
                    expect(callData[0].data).to.equal(formatExecBorrowCallData(weth))
                    expect(callData[1].to).to.equal(addresses.mainnet.capAutomator)
                    expect(callData[1].data).to.equal(formatExecCallData(wsteth))
                    expect(callData[2].to).to.equal(addresses.mainnet.capAutomator)
                    expect(callData[2].data).to.equal(formatExecSupplyCallData(reth))

                    const wstethSupplyCapBefore = BigInt((await protocolDataProvider.getReserveCaps(wsteth)).supplyCap)
                    const wstethBorrowCapBefore = BigInt((await protocolDataProvider.getReserveCaps(wsteth)).borrowCap)

                    const rethSupplyCapBefore = BigInt((await protocolDataProvider.getReserveCaps(reth)).supplyCap)

                    const wethBorrowCapBefore = BigInt((await protocolDataProvider.getReserveCaps(weth)).borrowCap)

                    await Promise.all(
                        callData.map(async (txData) => {
                            await insistOnExecution(() =>
                                keeper.sendTransaction({
                                    to: txData.to,
                                    data: txData.data,
                                }),
                            )
                        }),
                    )

                    const wstethSupplyCapAfter = BigInt((await protocolDataProvider.getReserveCaps(wsteth)).supplyCap)
                    const wstethBorrowCapAfter = BigInt((await protocolDataProvider.getReserveCaps(wsteth)).borrowCap)

                    const rethSupplyCapAfter = BigInt((await protocolDataProvider.getReserveCaps(reth)).supplyCap)

                    const wethBorrowCapAfter = BigInt((await protocolDataProvider.getReserveCaps(weth)).borrowCap)

                    expect(wstethSupplyCapAfter).to.equal(wstethSupplyCapBefore + wstethSupplyAmountInFullTokens)
                    expect(wstethBorrowCapAfter).to.equal(wstethBorrowCapBefore + wstethBorrowAmountInFullTokens)

                    expect(rethSupplyCapAfter).to.equal(rethSupplyCapBefore + rethSupplyAmountInFullTokens)

                    // After initial cap setting, when fast forwarding time, some interest is accrued and added to capAfter
                    expect(Number(wethBorrowCapAfter)).to.be.greaterThanOrEqual(
                        Number(wethBorrowCapBefore + wethBorrowAmountInFullTokens),
                    )
                    expect(Number(wethBorrowCapAfter)).to.be.lessThanOrEqual(
                        Number(
                            ((wethBorrowCapBefore + wethBorrowAmountInFullTokens) * BigInt(100015)) / BigInt(100000),
                        ),
                    )
                })
            })
        })
    })
})
