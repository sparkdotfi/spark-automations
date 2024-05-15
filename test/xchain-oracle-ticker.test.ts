import hre from 'hardhat'
import { expect } from 'chai'
import { Contract } from '@ethersproject/contracts'
import { Web3FunctionResultCallData } from '@gelatonetwork/web3-functions-sdk/*'
import { Web3FunctionHardhat } from '@gelatonetwork/web3-functions-sdk/hardhat-plugin'
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'
import { SnapshotRestorer, impersonateAccount, takeSnapshot, time } from '@nomicfoundation/hardhat-network-helpers'

import { forwarderAbi, multicallAbi, potAbi } from '../abis'
import { addresses } from '../utils'

const { w3f, ethers } = hre

describe.only('xchainOracleTicker', function () {
    this.timeout(0)

    let cleanStateRestorer: SnapshotRestorer
    let snapshotRestorer: SnapshotRestorer

    let keeper: SignerWithAddress
    let pauseProxy: SignerWithAddress
    let reader: SignerWithAddress

    let xchainOracleTickerW3F: Web3FunctionHardhat

    let forwarder: Contract
    let pot: Contract

    let userArgs = {
        "forwarder": "0x4042127DecC0cF7cc0966791abebf7F76294DeF3",
        "maxDelta": "10000000",
        "gasLimit": "8000000",
        "isBridgingArbitrumStyle": false,
        "maxFeePerGas": "0",
        "baseFee": "0"
    }

    const newDsr = BigInt('1000000001585489599188229325')

    before(async () => {
        cleanStateRestorer = await takeSnapshot()

        ;[reader, keeper] = await ethers.getSigners()
        await impersonateAccount(addresses.mainnet.pauseProxy)
        pauseProxy = await ethers.getSigner(addresses.mainnet.pauseProxy)

        forwarder = new Contract(userArgs.forwarder, forwarderAbi, reader)
        pot = new Contract(addresses.mainnet.pot, potAbi, pauseProxy)

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

    it('refresh is needed (dsr updated)', async () => {
        // both drip and file need to be called at the same timestamp
        await pot.drip()
        const timestamp = (await pot.provider.getBlock('latest')).timestamp
        await time.setNextBlockTimestamp(timestamp)
        await pauseProxy.sendTransaction({
            to: pot.address,
            data: pot.interface.encodeFunctionData('file(bytes32,uint256)', [
                ethers.utils.formatBytes32String('dsr'),
                newDsr,
            ]),
            gasLimit: 10000000
        })

        const { result } = await xchainOracleTickerW3F.run('onRun', { userArgs })

        expect(result.canExec).to.equal(true)

        if (!result.canExec) {
            throw ''
        }
        const callData = result.callData as Web3FunctionResultCallData[]

        expect(callData).to.deep.equal([
            {
                to: userArgs.forwarder,
                data: forwarder.interface.encodeFunctionData('refresh', [userArgs.gasLimit]),
            },
        ])

        const dsrBefore = (await forwarder.getLastSeenPotData()).dsr
        expect(dsrBefore).to.not.equal(newDsr)

        await keeper.sendTransaction({
            to: callData[0].to,
            data: callData[0].data,
        })

        const dsrAfter = (await forwarder.getLastSeenPotData()).dsr
        expect(dsrAfter).to.equal(newDsr)
    })

    it('refresh is needed (stale rho)', async () => {
        const { result } = await xchainOracleTickerW3F.run('onRun', { userArgs: {
            ...userArgs,
            maxDelta: '1000'
        } })

        expect(result.canExec).to.equal(true)

        if (!result.canExec) {
            throw ''
        }
        const callData = result.callData as Web3FunctionResultCallData[]

        expect(callData).to.deep.equal([
            {
                to: userArgs.forwarder,
                data: forwarder.interface.encodeFunctionData('refresh', [userArgs.gasLimit]),
            },
        ])

        const potRho = (await pot.rho()).toNumber()
        const rhoBefore = (await forwarder.getLastSeenPotData()).rho

        await keeper.sendTransaction({
            to: callData[0].to,
            data: callData[0].data,
        })

        const rhoAfter = (await forwarder.getLastSeenPotData()).rho

        expect(rhoBefore).to.be.lessThan(potRho)
        expect(rhoAfter).to.equal(potRho)
    })

    describe('arbitrum style', () => {
        it.skip('refresh is needed (dsr updated)', async () => {})

        it.skip('refresh is needed (stale rho)', async () => {})
    })
})
