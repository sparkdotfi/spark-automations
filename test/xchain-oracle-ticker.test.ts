import hre from 'hardhat'
import { expect } from 'chai'
import { Web3FunctionHardhat } from '@gelatonetwork/web3-functions-sdk/hardhat-plugin'
import { SnapshotRestorer, takeSnapshot } from '@nomicfoundation/hardhat-network-helpers'

const { w3f } = hre

describe.only('xchainOracleTicker', function () {
    this.timeout(0)

    let snapshotRestorer: SnapshotRestorer

    let xchainOracleTickerW3F: Web3FunctionHardhat

    let userArgs = {
        "forwarder": "0x4042127DecC0cF7cc0966791abebf7F76294DeF3",
        "maxDelta": "0",
        "gasLimit": "10000000",
        "isBridgingArbitrumStyle": false,
        "maxFeePerGas": "0",
        "baseFee": "0"
    }

    before(async () => {
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

})
