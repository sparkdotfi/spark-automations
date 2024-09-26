import hre from 'hardhat'
import { expect } from 'chai'
import { Contract } from '@ethersproject/contracts'
import { Web3FunctionResultCallData } from '@gelatonetwork/web3-functions-sdk/*'
import { Web3FunctionHardhat } from '@gelatonetwork/web3-functions-sdk/hardhat-plugin'
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'
import { SnapshotRestorer, impersonateAccount, takeSnapshot, time } from '@nomicfoundation/hardhat-network-helpers'
import { utils } from 'ethers'

import { ssrOptimismStyleForwarderAbi, susdsAbi } from '../../../abis'
import { addresses, insistOnExecution } from '../../../utils'

const { w3f, ethers } = hre

describe('ssrXChainOracleTicker', function () {
    this.timeout(0)

    let cleanStateRestorer: SnapshotRestorer
    let snapshotRestorer: SnapshotRestorer

    let keeper: SignerWithAddress
    let pauseProxy: SignerWithAddress
    let reader: SignerWithAddress

    let xchainOracleTickerW3F: Web3FunctionHardhat

    let forwarderInterface: utils.Interface

    let susds: Contract

    let optimismStyleForwarderAddresses: string[]
    let allForwarderAddresses: string[]

    let userArgs = {
        maxDelta: '10000000',
        gasLimit: '800000',
        sendSlackMessages: false,
    }

    const newSsr = BigInt('1000000001585489599188229325')

    before(async () => {
        cleanStateRestorer = await takeSnapshot()
        ;[reader, keeper] = await ethers.getSigners()
        await impersonateAccount(addresses.mainnet.pauseProxy)
        pauseProxy = await ethers.getSigner(addresses.mainnet.pauseProxy)

        optimismStyleForwarderAddresses = Object.values(addresses.mainnet.ssrForwarders.optimismStyle)
        allForwarderAddresses = [...optimismStyleForwarderAddresses]

        susds = new Contract(addresses.mainnet.susds, susdsAbi, pauseProxy)
        forwarderInterface = new utils.Interface(ssrOptimismStyleForwarderAbi)

        xchainOracleTickerW3F = w3f.get('ssr-xchain-oracle-ticker')
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

    it('no refreshes needed', async () => {
        const { result } = await xchainOracleTickerW3F.run('onRun', { userArgs })

        expect(result.canExec).to.equal(false)
        !result.canExec && expect(result.message).to.equal('sUSDS data refresh not needed')
    })

    it('all refreshes are needed (stale rho)', async () => {
        const rhoDeltas = await Promise.all(
            allForwarderAddresses.map(async (forwarderAddress) => {
                const forwarder = new Contract(forwarderAddress, forwarderInterface, reader)
                const lastSeenSUSDSData = await forwarder.getLastSeenSUSDSData()
                return (await susds.provider.getBlock('latest')).timestamp - lastSeenSUSDSData.rho
            }),
        )

        const smallestRhoDelta = Math.min(...rhoDeltas)

        const { result } = await xchainOracleTickerW3F.run('onRun', {
            userArgs: {
                ...userArgs,
                maxDelta: (smallestRhoDelta - 1).toString(),
            },
        })

        expect(result.canExec).to.equal(true)

        if (!result.canExec) {
            throw ''
        }
        const callData = result.callData as Web3FunctionResultCallData[]

        expect(callData).to.have.length(allForwarderAddresses.length)

        for (const forwarderAddress of allForwarderAddresses) {
            const forwarder = new Contract(forwarderAddress, forwarderInterface, reader)
            const susdsRho = (await susds.rho()).toNumber()
            const rhoBefore = (await forwarder.getLastSeenSUSDSData()).rho

            await insistOnExecution(() =>
                keeper.sendTransaction({
                    to: callData[allForwarderAddresses.indexOf(forwarderAddress)].to,
                    data: callData[allForwarderAddresses.indexOf(forwarderAddress)].data,
                }),
            )

            const rhoAfter = (await forwarder.getLastSeenSUSDSData()).rho
            expect(rhoBefore).to.be.lessThan(susdsRho)
            expect(rhoAfter).to.equal(susdsRho)
        }
    })

    it('all refreshes are needed (ssr update)', async () => {
        // both drip and file need to be called at the same timestamp
        await insistOnExecution(() => susds.drip())
        const timestamp = (await susds.provider.getBlock('latest')).timestamp
        await time.setNextBlockTimestamp(timestamp)
        await insistOnExecution(() =>
            pauseProxy.sendTransaction({
                to: susds.address,
                data: susds.interface.encodeFunctionData('file(bytes32,uint256)', [
                    ethers.utils.formatBytes32String('ssr'),
                    newSsr,
                ]),
            }),
        )

        const { result } = await xchainOracleTickerW3F.run('onRun', { userArgs })

        expect(result.canExec).to.equal(true)

        if (!result.canExec) {
            throw ''
        }
        const callData = result.callData as Web3FunctionResultCallData[]

        expect(callData).to.have.length(allForwarderAddresses.length)

        for (const forwarderAddress of allForwarderAddresses) {
            const forwarder = new Contract(forwarderAddress, forwarderInterface, reader)
            const ssrBefore = (await forwarder.getLastSeenSUSDSData()).ssr
            expect(ssrBefore).to.not.equal(newSsr)
        }

        await Promise.all(
            callData.map(async (_callData) => {
                await keeper.sendTransaction(_callData)
            }),
        )

        for (const forwarderAddress of allForwarderAddresses) {
            const forwarder = new Contract(forwarderAddress, forwarderInterface, reader)
            const ssrAfter = (await forwarder.getLastSeenSUSDSData()).ssr
            expect(ssrAfter).to.equal(newSsr)
        }
    })
})
