import hre from 'hardhat'
import { expect } from 'chai'
import { Contract } from '@ethersproject/contracts'
import { Web3FunctionResultCallData } from '@gelatonetwork/web3-functions-sdk/*'
import { Web3FunctionHardhat } from '@gelatonetwork/web3-functions-sdk/hardhat-plugin'
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'
import { SnapshotRestorer, impersonateAccount, takeSnapshot, time } from '@nomicfoundation/hardhat-network-helpers'
import { utils } from 'ethers'

import { forwarderAbi, forwarderArbitrumAbi, potAbi } from '../../../abis'
import { addresses, insistOnExecution } from '../../../utils'

const { w3f, ethers } = hre

describe.only('xchainOracleTicker', function () {
    this.timeout(0)

    let cleanStateRestorer: SnapshotRestorer
    let snapshotRestorer: SnapshotRestorer

    let keeper: SignerWithAddress
    let pauseProxy: SignerWithAddress
    let reader: SignerWithAddress

    let xchainOracleTickerW3F: Web3FunctionHardhat

    let forwarderInterface: utils.Interface

    let pot: Contract

    let optimismStyleForwarderAddresses: string[]
    let arbitrumStyleForwarderAddresses: string[]
    let allForwarderAddresses: string[]

    let userArgs = {
        maxDelta: '10000000',
        gasLimit: '800000',
        sendSlackMessages: false,
    }
    let refreshArgs = [userArgs.gasLimit]

    const newDsr = BigInt('1000000001585489599188229325')

    before(async () => {
        cleanStateRestorer = await takeSnapshot()
        ;[reader, keeper] = await ethers.getSigners()
        await impersonateAccount(addresses.mainnet.pauseProxy)
        pauseProxy = await ethers.getSigner(addresses.mainnet.pauseProxy)

        optimismStyleForwarderAddresses = Object.values(addresses.mainnet.dsrForwarders.optimismStyle)
        arbitrumStyleForwarderAddresses = Object.values(addresses.mainnet.dsrForwarders.arbitrumStyle)
        allForwarderAddresses = [...optimismStyleForwarderAddresses, ...arbitrumStyleForwarderAddresses]

        pot = new Contract(addresses.mainnet.pot, potAbi, pauseProxy)
        forwarderInterface = new utils.Interface(forwarderAbi)

        xchainOracleTickerW3F = w3f.get('xchain-oracle-ticker')
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
        !result.canExec && expect(result.message).to.equal('Pot data refresh not needed')
    })

    it.skip('some refreshes is needed (stale rho)', async () => {})

    it.skip('all refreshes are needed (stale rho)', async () => {})

    it.skip('some refreshes is needed (dsr update)', async () => {})

    it('all refreshes are needed (dsr update)', async () => {
            // both drip and file need to be called at the same timestamp
            await insistOnExecution(() => pot.drip())
            const timestamp = (await pot.provider.getBlock('latest')).timestamp
            await time.setNextBlockTimestamp(timestamp)
            await insistOnExecution(() =>
                pauseProxy.sendTransaction({
                    to: pot.address,
                    data: pot.interface.encodeFunctionData('file(bytes32,uint256)', [
                        ethers.utils.formatBytes32String('dsr'),
                        newDsr,
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
                console.log('before')
                const forwarder = new Contract(forwarderAddress, forwarderInterface, reader)
                const dsrBefore = (await forwarder.getLastSeenPotData()).dsr
                console.log(forwarderAddress)
                console.log(dsrBefore.toString())
                expect(dsrBefore).to.not.equal(newDsr)
            }

            await Promise.all(callData.map(async (call) => {
                console.log(call)
                await keeper.sendTransaction(call)
            }))
            // await insistOnExecution(() =>
            //     keeper.sendTransaction({
            //         to: callData[0].to,
            //         data: callData[0].data,
            //     }),
            // )
            // await insistOnExecution(() =>
            //     keeper.sendTransaction({
            //         to: callData[1].to,
            //         data: callData[1].data,
            //     }),
            // )
            // console.log('balance', utils.formatEther((await keeper.getBalance()).toString()))
            // // await insistOnExecution(() =>
            // //     keeper.sendTransaction({
            // //         to: callData[2].to,
            // //         data: new utils.Interface(forwarderArbitrumAbi).encodeFunctionData('refresh', [
            // //             '500000',
            // //             '1000000000',
            // //             '1100000000',
            // //         ]),
            // //     value: ethers.utils.parseEther('1')
            // //     }),
            // // )

            for (const forwarderAddress of allForwarderAddresses) {
                console.log('after')
                console.log(forwarderAddress)
                const forwarder = new Contract(forwarderAddress, forwarderInterface, reader)
                const dsrAfter = (await forwarder.getLastSeenPotData()).dsr
                console.log(dsrAfter.toString())
                expect(dsrAfter).to.equal(newDsr)
            }
        })
})

