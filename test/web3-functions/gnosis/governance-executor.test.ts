import hre from 'hardhat'
import { expect } from 'chai'
import { Web3FunctionHardhat } from '@gelatonetwork/web3-functions-sdk/hardhat-plugin'
import { SnapshotRestorer, takeSnapshot } from '@nomicfoundation/hardhat-network-helpers'

const { w3f } = hre

describe('GovernanceExecutor', function () {
    this.timeout(0)

    let cleanStateRestorer: SnapshotRestorer
    let snapshotRestorer: SnapshotRestorer

    let governanceExecutorW3F: Web3FunctionHardhat

    before(async () => {
        cleanStateRestorer = await takeSnapshot()

        governanceExecutorW3F = w3f.get('governance-executor')
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

    it('no actions to execute', async () => {
        // No thresholds are met at the forked state
        const { result } = await governanceExecutorW3F.run('onRun')

        expect(result.canExec).to.equal(false)
        !result.canExec && expect(result.message).to.equal('Not implemented')
    })
})
