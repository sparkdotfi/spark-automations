import hre from 'hardhat'
import { expect } from 'chai'
import { Contract } from '@ethersproject/contracts'
import { Web3FunctionHardhat } from '@gelatonetwork/web3-functions-sdk/hardhat-plugin'
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'
import { SnapshotRestorer, impersonateAccount, takeSnapshot } from '@nomicfoundation/hardhat-network-helpers'

import { potAbi } from '../abis'
import { addresses } from '../utils'

const { w3f, ethers } = hre

describe.only('xchainOracleTicker', function () {
    this.timeout(0)

    let snapshotRestorer: SnapshotRestorer
    let pauseProxy: SignerWithAddress

    let xchainOracleTickerW3F: Web3FunctionHardhat

    let pot: Contract

    let userArgs = {
        "forwarder": "0x4042127DecC0cF7cc0966791abebf7F76294DeF3",
        "maxDelta": "10000000",
        "gasLimit": "10000000",
        "isBridgingArbitrumStyle": false,
        "maxFeePerGas": "0",
        "baseFee": "0"
    }

    const newDsr = BigInt('1000000001585489599188229325')

    before(async () => {
        await impersonateAccount(addresses.mainnet.pauseProxy)
        pauseProxy = await ethers.getSigner(addresses.mainnet.pauseProxy)

        pot = new Contract(addresses.mainnet.pot, potAbi, pauseProxy)

        xchainOracleTickerW3F = w3f.get('xchain-oracle-ticker')
    })

    beforeEach(async () => {
        snapshotRestorer = await takeSnapshot()
    })

    afterEach(async () => {
        await snapshotRestorer.restore()
    })

    it('no refreshes needed', async () => {
        const { result } = await xchainOracleTickerW3F.run('onRun', { userArgs })

        expect(result.canExec).to.equal(false)
        !result.canExec && expect(result.message).to.equal('Pot data refresh not needed')
    })

    it('refresh is needed (dsr updated)', async () => {
        await pot.file('dsr', newDsr)

        const { result } = await xchainOracleTickerW3F.run('onRun', { userArgs })

        expect(result.canExec).to.equal(true)
    })

    it('refresh is needed (stale rho)', async () => {})

    describe('arbitrum style', () => {
        it('refresh is needed (dsr updated)', async () => {})

        it('refresh is needed (stale rho)', async () => {})
    })
})
