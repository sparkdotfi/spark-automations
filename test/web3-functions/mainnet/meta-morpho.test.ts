import hre from 'hardhat'
import { expect } from 'chai'
import { Contract } from '@ethersproject/contracts'
import { Web3FunctionHardhat } from '@gelatonetwork/web3-functions-sdk/hardhat-plugin'
import { Web3FunctionResultCallData } from '@gelatonetwork/web3-functions-sdk/*'
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'
import { SnapshotRestorer, impersonateAccount, mine, takeSnapshot } from '@nomicfoundation/hardhat-network-helpers'

import { metaMorphoAbi } from '../../../abis'
import { addresses, calculateMetaMorphoMarketId, insistOnExecution } from '../../../utils'
import { BigNumber } from 'ethers'

const { w3f, ethers } = hre

describe('MetaMorpho', function () {
    this.timeout(0)

    let cleanStateRestorer: SnapshotRestorer
    let snapshotRestorer: SnapshotRestorer

    let metaMorphoW3F: Web3FunctionHardhat
    let executor: SignerWithAddress
    let keeper: SignerWithAddress

    let metaMorphoVault: Contract

    // Markets to monitor for cap changes
    const userArgs = {
        marketParams_loanToken: [
            '0x6B175474E89094C44Da98b954EedeAC495271d0F', // DAI
            '0x6B175474E89094C44Da98b954EedeAC495271d0F', // DAI
        ],
        marketParams_collateralToken: [
            '0x9D39A5DE30e57443BfF2A8307A4256c8797A3497', // SUSDE
            '0x4c9EDD5852cd905f086C759E8383e09bff1E68B3', // USDE
        ],
        marketParams_oracle: [
            '0x5D916980D5Ae1737a8330Bf24dF812b2911Aae25', // SUSDE ORACLE
            '0xaE4750d0813B5E37A51f7629beedd72AF1f9cA35', // USDE ORACLE
        ],
        marketParams_irm: [
            '0x870aC11D48B15DB9a138Cf899d20F13F79Ba00BC', // DEFAULT IRM
            '0x870aC11D48B15DB9a138Cf899d20F13F79Ba00BC', // DEFAULT IRM
        ],
        marketParams_lltv: [
            '860000000000000000', // 0.86
            '860000000000000000', // 0.86
        ],
    }

    let susdeMarketId: string
    let usdeMarketId: string
    let timelock: BigNumber

    before(async () => {
        cleanStateRestorer = await takeSnapshot()
        ;[executor, keeper] = await ethers.getSigners()

        await impersonateAccount(addresses.mainnet.executor)
        executor = await ethers.getSigner(addresses.mainnet.executor)

        susdeMarketId = calculateMetaMorphoMarketId(
            userArgs.marketParams_loanToken[0],
            userArgs.marketParams_collateralToken[0],
            userArgs.marketParams_oracle[0],
            userArgs.marketParams_irm[0],
            userArgs.marketParams_lltv[0],
        )
        usdeMarketId = calculateMetaMorphoMarketId(
            userArgs.marketParams_loanToken[1],
            userArgs.marketParams_collateralToken[1],
            userArgs.marketParams_oracle[1],
            userArgs.marketParams_irm[1],
            userArgs.marketParams_lltv[1],
        )

        metaMorphoVault = new Contract(addresses.mainnet.metaMorpho, metaMorphoAbi, executor)

        timelock = await metaMorphoVault.timelock()

        metaMorphoW3F = w3f.get('meta-morpho')
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

    it('no pending caps', async () => {
        const { result } = await metaMorphoW3F.run('onRun', { userArgs })

        expect(result.canExec).to.equal(false)
        !result.canExec && expect(result.message).to.equal('No pending caps to be accepted')
    })

    it('no pending caps (waiting for the timelock)', async () => {
        const susdeCurrentCap = (await metaMorphoVault.config(susdeMarketId)).cap

        await metaMorphoVault.submitCap(
            [
                userArgs.marketParams_loanToken[0],
                userArgs.marketParams_collateralToken[0],
                userArgs.marketParams_oracle[0],
                userArgs.marketParams_irm[0],
                userArgs.marketParams_lltv[0],
            ],
            susdeCurrentCap.add(1),
        )

        await mine(2, { interval: timelock.sub(1) })

        const { result } = await metaMorphoW3F.run('onRun', { userArgs })

        expect(result.canExec).to.equal(false)
        !result.canExec && expect(result.message).to.equal('No pending caps to be accepted')
    })

    it('one cap update to be accepted', async () => {
        const susdeInitialCap = (await metaMorphoVault.config(susdeMarketId)).cap

        await metaMorphoVault.submitCap(
            [
                userArgs.marketParams_loanToken[0],
                userArgs.marketParams_collateralToken[0],
                userArgs.marketParams_oracle[0],
                userArgs.marketParams_irm[0],
                userArgs.marketParams_lltv[0],
            ],
            susdeInitialCap.add(1),
        )
        await mine(2, { interval: timelock.sub(1) })

        const { result: negativeResult } = await metaMorphoW3F.run('onRun', { userArgs })

        expect(negativeResult.canExec).to.equal(false)
        !negativeResult.canExec && expect(negativeResult.message).to.equal('No pending caps to be accepted')

        await mine(2, { interval: 1 })

        const { result: positiveResult } = await metaMorphoW3F.run('onRun', { userArgs })

        expect(positiveResult.canExec).to.equal(true)
        if (!positiveResult.canExec) {
            throw ''
        }
        const callData = positiveResult.callData as Web3FunctionResultCallData[]

        expect(callData).to.deep.equal([
            {
                to: addresses.mainnet.metaMorpho,
                data: metaMorphoVault.interface.encodeFunctionData('acceptCap', [
                    [
                        userArgs.marketParams_loanToken[0],
                        userArgs.marketParams_collateralToken[0],
                        userArgs.marketParams_oracle[0],
                        userArgs.marketParams_irm[0],
                        userArgs.marketParams_lltv[0],
                    ],
                ]),
            },
        ])

        const capBefore = (await metaMorphoVault.config(susdeMarketId)).cap
        expect(capBefore).to.equal(susdeInitialCap)

        const pendingCapBefore = (await metaMorphoVault.pendingCap(susdeMarketId)).value
        expect(pendingCapBefore).to.equal(susdeInitialCap.add(1))

        await insistOnExecution(() =>
            keeper.sendTransaction({
                to: callData[0].to,
                data: callData[0].data,
            }),
        )

        const capAfter = (await metaMorphoVault.config(susdeMarketId)).cap
        expect(capAfter).to.equal(susdeInitialCap.add(1))

        const pendingCapAfter = (await metaMorphoVault.pendingCap(susdeMarketId)).value
        expect(pendingCapAfter).to.equal(0)
    })

    it('two cap updates to be accepted', async () => {
        const susdeInitialCap = (await metaMorphoVault.config(susdeMarketId)).cap
        const usdeInitialCap = (await metaMorphoVault.config(usdeMarketId)).cap

        await metaMorphoVault.submitCap(
            [
                userArgs.marketParams_loanToken[0],
                userArgs.marketParams_collateralToken[0],
                userArgs.marketParams_oracle[0],
                userArgs.marketParams_irm[0],
                userArgs.marketParams_lltv[0],
            ],
            susdeInitialCap.add(1),
        )
        await metaMorphoVault.submitCap(
            [
                userArgs.marketParams_loanToken[1],
                userArgs.marketParams_collateralToken[1],
                userArgs.marketParams_oracle[1],
                userArgs.marketParams_irm[1],
                userArgs.marketParams_lltv[1],
            ],
            usdeInitialCap.add(1),
        )

        await mine(2, { interval: timelock })

        const { result } = await metaMorphoW3F.run('onRun', { userArgs })

        expect(result.canExec).to.equal(true)
        if (!result.canExec) {
            throw ''
        }
        const callData = result.callData as Web3FunctionResultCallData[]

        expect(callData).to.deep.equal([
            {
                to: addresses.mainnet.metaMorpho,
                data: metaMorphoVault.interface.encodeFunctionData('acceptCap', [
                    [
                        userArgs.marketParams_loanToken[0],
                        userArgs.marketParams_collateralToken[0],
                        userArgs.marketParams_oracle[0],
                        userArgs.marketParams_irm[0],
                        userArgs.marketParams_lltv[0],
                    ],
                ]),
            },
            {
                to: addresses.mainnet.metaMorpho,
                data: metaMorphoVault.interface.encodeFunctionData('acceptCap', [
                    [
                        userArgs.marketParams_loanToken[1],
                        userArgs.marketParams_collateralToken[1],
                        userArgs.marketParams_oracle[1],
                        userArgs.marketParams_irm[1],
                        userArgs.marketParams_lltv[1],
                    ],
                ]),
            },
        ])

        const susdeCapBefore = (await metaMorphoVault.config(susdeMarketId)).cap
        expect(susdeCapBefore).to.equal(susdeInitialCap)

        const pendingSusdeCapBefore = (await metaMorphoVault.pendingCap(susdeMarketId)).value
        expect(pendingSusdeCapBefore).to.equal(susdeInitialCap.add(1))

        const usdeCapBefore = (await metaMorphoVault.config(usdeMarketId)).cap
        expect(usdeCapBefore).to.equal(usdeInitialCap)

        const pendingUsdeCapBefore = (await metaMorphoVault.pendingCap(usdeMarketId)).value
        expect(pendingUsdeCapBefore).to.equal(usdeInitialCap.add(1))

        await insistOnExecution(() =>
            keeper.sendTransaction({
                to: callData[0].to,
                data: callData[0].data,
            }),
        )

        const capSusdeAfter = (await metaMorphoVault.config(susdeMarketId)).cap
        expect(capSusdeAfter).to.equal(susdeInitialCap.add(1))

        const pendingSusdeCapAfter = (await metaMorphoVault.pendingCap(susdeMarketId)).value
        expect(pendingSusdeCapAfter).to.equal(0)

        const capUusdeAfter = (await metaMorphoVault.config(susdeMarketId)).cap
        expect(capUusdeAfter).to.equal(susdeInitialCap.add(1))

        const pendingUusdeCapAfter = (await metaMorphoVault.pendingCap(susdeMarketId)).value
        expect(pendingUusdeCapAfter).to.equal(0)
    })
})
