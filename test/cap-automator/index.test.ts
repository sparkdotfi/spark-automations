import hre from 'hardhat'
import { expect } from 'chai'
import { Web3FunctionHardhat } from '@gelatonetwork/web3-functions-sdk/hardhat-plugin'
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'
import { SnapshotRestorer, impersonateAccount, takeSnapshot, mine } from '@nomicfoundation/hardhat-network-helpers'
import { Contract } from '@ethersproject/contracts'

import { capAutomatorAbi, erc20Abi, poolAbi, protocolDataProviderAbi } from '../../abis'
import { addresses } from '../../utils'
import { Web3FunctionResultCallData } from '@gelatonetwork/web3-functions-sdk/*'

const { w3f, ethers } = hre

describe('CapAutomator', function () {
    this.timeout(0)

    let snapshotRestorer: SnapshotRestorer

    let capAutomatorW3F: Web3FunctionHardhat
    let reader: SignerWithAddress
    let keeper: SignerWithAddress

    let capAutomator: Contract
    let protocolDataProvider: Contract
    let pool: Contract

    let sparkAssets: string[]

    const wbtc = '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599' as const
    const wsteth = '0x7f39C581F595B53c5cb19bD0b3f8dA6c935E2Ca0' as const
    const weth = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2' as const

    const wbtcWhale = '0xb20Fb60E27a1Be799b5e04159eC2024CC3734eD7' as const
    const wstethWhale = '0x5fEC2f34D80ED82370F733043B6A536d7e9D7f8d' as const

    const deposit = async (signerAddress: string, tokenAddress: string, amount: BigInt) => {
        await impersonateAccount(signerAddress)
        const signer = await hre.ethers.getSigner(signerAddress)

        const token = new Contract(tokenAddress, erc20Abi, signer)

        await token.approve(addresses.mainnet.pool, amount)

        const pool = new Contract(addresses.mainnet.pool, poolAbi, signer)
        await pool.supply(tokenAddress, amount, signerAddress, 0)
    }

    const borrow = async (signerAddress: string, tokenAddress: string, amount: BigInt) => {
        await impersonateAccount(signerAddress)
        const signer = await hre.ethers.getSigner(signerAddress)

        const pool = new Contract(addresses.mainnet.pool, poolAbi, signer)
        await pool.borrow(tokenAddress, amount, 2, 0, signerAddress)
    }

    const formatExecSupplyCallData = (assetAddress: string) =>
        `0xb00d4b1c000000000000000000000000${assetAddress.slice(2).toLocaleLowerCase()}`

    const formatExecBorrowCallData = (assetAddress: string) =>
        `0xb1ae9f48000000000000000000000000${assetAddress.slice(2).toLocaleLowerCase()}`

    before(async () => {
        ;[reader, keeper] = await ethers.getSigners()

        pool = new Contract(addresses.mainnet.pool, poolAbi, reader)
        capAutomator = new Contract(addresses.mainnet.capAutomator, capAutomatorAbi, reader)
        protocolDataProvider = new Contract(addresses.mainnet.protocolDataProvider, protocolDataProviderAbi, reader)

        sparkAssets = await pool.getReservesList()

        for (const assetAddress of sparkAssets) {
            await capAutomator.exec(assetAddress)
        }

        await mine(2, { interval: 24 * 60 * 60 })

        capAutomatorW3F = w3f.get('cap-automator')
    })

    it('no cap updates are required', async () => {
        const { result } = await capAutomatorW3F.run('onRun')

        expect(result.canExec).to.equal(false)
        !result.canExec && expect(result.message).to.equal('No cap automator calls to be executed')
    })

    describe('execSupply', () => {
        beforeEach(async () => {
            snapshotRestorer = await takeSnapshot()
        })

        afterEach(async () => {
            await snapshotRestorer.restore()
        })

        const testedThresholds = [3000, 4000, 5000, 6000, 7000, 8000, 9000]

        testedThresholds.forEach((threshold) => {
            describe(`${threshold / 100}% threshold`, () => {
                it(`actual gap is smaller than optimal but the threshold is not met`, async () => {
                    const { gap } = await capAutomator.supplyCapConfigs(wbtc)

                    const percentageOfTheGapNeededForTrigger = (10000 - threshold) / 100 + 1

                    // full tokens * WBTC decimals * percentage of the gap
                    const amountInFullTokens = (BigInt(gap) * BigInt(percentageOfTheGapNeededForTrigger)) / BigInt(100)

                    // depositing only 1/4 of the full amount
                    await deposit(wbtcWhale, wbtc, (amountInFullTokens * BigInt(10 ** 8)) / BigInt(4))

                    const { result: negativeResult } = await capAutomatorW3F.run('onRun', { userArgs: { threshold } })

                    expect(negativeResult.canExec).to.equal(false)
                    !negativeResult.canExec &&
                        expect(negativeResult.message).to.equal('No cap automator calls to be executed')
                })

                it(`one supply cap update is required`, async () => {
                    const { gap } = await capAutomator.supplyCapConfigs(wbtc)

                    const percentageOfTheGapNeededForTrigger = (10000 - threshold) / 100 + 1

                    // full tokens * WBTC decimals * percentage of the gap
                    const amountInFullTokens = (BigInt(gap) * BigInt(percentageOfTheGapNeededForTrigger)) / BigInt(100)

                    // depositing only 1/4 of the full deposit amount
                    await deposit(wbtcWhale, wbtc, (amountInFullTokens * BigInt(10 ** 8)) / BigInt(4))

                    const { result: negativeResult } = await capAutomatorW3F.run('onRun', { userArgs: { threshold } })

                    expect(negativeResult.canExec).to.equal(false)

                    // depositing remaining of the full deposit amount
                    await deposit(wbtcWhale, wbtc, (amountInFullTokens * BigInt(10 ** 8) * BigInt(3)) / BigInt(4))

                    const { result: positiveResult } = await capAutomatorW3F.run('onRun', { userArgs: { threshold } })

                    expect(positiveResult.canExec).to.equal(true)
                    if (!positiveResult.canExec) {
                        throw ''
                    }

                    const callData = positiveResult.callData as Web3FunctionResultCallData[]

                    expect(callData.length).to.equal(1)

                    expect(callData[0].to).to.equal(addresses.mainnet.capAutomator)
                    expect(callData[0].data).to.equal(formatExecSupplyCallData(wbtc))

                    const supplyCapBefore = BigInt((await protocolDataProvider.getReserveCaps(wbtc)).supplyCap)

                    await keeper.sendTransaction({
                        to: callData[0].to,
                        data: callData[0].data,
                    })

                    const supplyCapAfter = BigInt((await protocolDataProvider.getReserveCaps(wbtc)).supplyCap)

                    expect(supplyCapAfter).to.equal(supplyCapBefore + amountInFullTokens)
                })

                it('two supply cap updates are required', async () => {
                    const { gap: wstethGap } = await capAutomator.supplyCapConfigs(wsteth)
                    const { gap: wbtcGap } = await capAutomator.supplyCapConfigs(wbtc)

                    const percentageOfTheGapNeededForTrigger = (10000 - threshold) / 100 + 1

                    const wstethAmountInFullTokens =
                        (BigInt(wstethGap) * BigInt(percentageOfTheGapNeededForTrigger)) / BigInt(100)
                    const wbtcAmountInFullTokens =
                        (BigInt(wbtcGap) * BigInt(percentageOfTheGapNeededForTrigger)) / BigInt(100)

                    await deposit(wstethWhale, wsteth, wstethAmountInFullTokens * BigInt(10 ** 18))
                    await deposit(wbtcWhale, wbtc, wbtcAmountInFullTokens * BigInt(10 ** 8))

                    const { result } = await capAutomatorW3F.run('onRun', { userArgs: { threshold } })

                    expect(result.canExec).to.equal(true)
                    if (!result.canExec) {
                        throw ''
                    }

                    const callData = result.callData as Web3FunctionResultCallData[]

                    expect(callData.length).to.equal(2)

                    expect(callData[0].to).to.equal(addresses.mainnet.capAutomator)
                    expect(callData[0].data).to.equal(formatExecSupplyCallData(wsteth))

                    expect(callData[1].to).to.equal(addresses.mainnet.capAutomator)
                    expect(callData[1].data).to.equal(formatExecSupplyCallData(wbtc))

                    const wstethSupplyCapBefore = BigInt((await protocolDataProvider.getReserveCaps(wsteth)).supplyCap)
                    const wbtcSupplyCapBefore = BigInt((await protocolDataProvider.getReserveCaps(wbtc)).supplyCap)

                    await Promise.all(
                        callData.map(async (txData) => {
                            await keeper.sendTransaction({
                                to: txData.to,
                                data: txData.data,
                            })
                        }),
                    )

                    const wstethSupplyCapAfter = BigInt((await protocolDataProvider.getReserveCaps(wsteth)).supplyCap)
                    const wbtcSupplyCapAfter = BigInt((await protocolDataProvider.getReserveCaps(wbtc)).supplyCap)

                    expect(wstethSupplyCapAfter).to.equal(wstethSupplyCapBefore + wstethAmountInFullTokens)
                    expect(wbtcSupplyCapAfter).to.equal(wbtcSupplyCapBefore + wbtcAmountInFullTokens)
                })
            })
        })
    })

    describe('execBorrow', () => {
        before(async () => {
            await deposit(wstethWhale, wsteth, BigInt(40000) * BigInt(10 ** 18))
            await deposit(wbtcWhale, wbtc, BigInt(400) * BigInt(10 ** 8))
            await capAutomator.execSupply(wsteth)
            await capAutomator.execSupply(wbtc)
            await mine(2, { interval: 24 * 60 * 60 })
        })

        beforeEach(async () => {
            snapshotRestorer = await takeSnapshot()
        })

        afterEach(async () => {
            await snapshotRestorer.restore()
        })
        const testedThresholds = [2000, 3000, 4000, 5000, 6000, 7000, 8000, 9000]

        testedThresholds.forEach((threshold) => {
            describe(`${threshold / 100}% threshold`, () => {
                it(`actual gap is smaller than optimal but the threshold is not met`, async () => {
                    const { gap } = await capAutomator.borrowCapConfigs(wsteth)

                    const percentageOfTheGapNeededForTrigger = (10000 - threshold) / 100 + 1

                    const amountInFullTokens = (BigInt(gap) * BigInt(percentageOfTheGapNeededForTrigger)) / BigInt(100)

                    // borrowing only 1/4 of the full amount
                    await borrow(wbtcWhale, wsteth, (amountInFullTokens * BigInt(10 ** 8)) / BigInt(4))

                    const { result: negativeResult } = await capAutomatorW3F.run('onRun', { userArgs: { threshold } })

                    expect(negativeResult.canExec).to.equal(false)
                    !negativeResult.canExec &&
                        expect(negativeResult.message).to.equal('No cap automator calls to be executed')
                })

                it('one borrow cap update is required', async () => {
                    const { gap } = await capAutomator.borrowCapConfigs(wsteth)

                    const percentageOfTheGapNeededForTrigger = (10000 - threshold) / 100 + 1

                    const amountInFullTokens = (BigInt(gap) * BigInt(percentageOfTheGapNeededForTrigger)) / BigInt(100)

                    // borrowing only 1/4 of the full borrow amount
                    await borrow(wbtcWhale, wsteth, (amountInFullTokens * BigInt(10 ** 18)) / BigInt(4))

                    const { result: negativeResult } = await capAutomatorW3F.run('onRun', { userArgs: { threshold } })

                    expect(negativeResult.canExec).to.equal(false)

                    // borrowing remaining of the full deposit amount
                    await borrow(wbtcWhale, wsteth, (amountInFullTokens * BigInt(10 ** 18) * BigInt(3)) / BigInt(4))

                    const { result: positiveResult } = await capAutomatorW3F.run('onRun', { userArgs: { threshold } })

                    expect(positiveResult.canExec).to.equal(true)
                    if (!positiveResult.canExec) {
                        throw ''
                    }

                    const callData = positiveResult.callData as Web3FunctionResultCallData[]

                    expect(callData.length).to.equal(1)

                    expect(callData[0].to).to.equal(addresses.mainnet.capAutomator)
                    expect(callData[0].data).to.equal(formatExecBorrowCallData(wsteth))

                    const borrowCapBefore = BigInt((await protocolDataProvider.getReserveCaps(wsteth)).borrowCap)

                    await keeper.sendTransaction({
                        to: callData[0].to,
                        data: callData[0].data,
                    })

                    const borrowCapAfter = BigInt((await protocolDataProvider.getReserveCaps(wsteth)).borrowCap)

                    expect(borrowCapAfter).to.equal(borrowCapBefore + amountInFullTokens)
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
                    await borrow(wbtcWhale, wsteth, wstethAmountInFullTokens * BigInt(10 ** 18))

                    const { result } = await capAutomatorW3F.run('onRun', { userArgs: { threshold } })

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
                    //
                    const wethBorrowCapBefore = BigInt((await protocolDataProvider.getReserveCaps(weth)).borrowCap)
                    const wstethBorrowCapBefore = BigInt((await protocolDataProvider.getReserveCaps(wsteth)).borrowCap)

                    await Promise.all(
                        callData.map(async (txData) => {
                            await keeper.sendTransaction({
                                to: txData.to,
                                data: txData.data,
                            })
                        }),
                    )
                    //
                    const wethBorrowCapAfter = BigInt((await protocolDataProvider.getReserveCaps(weth)).borrowCap)
                    const wstethBorrowCapAfter = BigInt((await protocolDataProvider.getReserveCaps(wsteth)).borrowCap)

                    // After initial cap setting, when fast forwarding time, some interest is accrued and added to capAfter
                    expect(Number(wethBorrowCapAfter)).to.be.greaterThanOrEqual(
                        Number(wethBorrowCapBefore + wethAmountInFullTokens),
                    )
                    expect(Number(wethBorrowCapAfter)).to.be.lessThanOrEqual(
                        Number(((wethBorrowCapBefore + wethAmountInFullTokens) * BigInt(100015)) / BigInt(100000)),
                    )
                    expect(wstethBorrowCapAfter).to.equal(wstethBorrowCapBefore + wstethAmountInFullTokens)
                })
            })
        })
    })
})
