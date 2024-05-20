import hre from 'hardhat'
import chai from 'chai'
import { Web3FunctionHardhat } from '@gelatonetwork/web3-functions-sdk/hardhat-plugin'
import { SnapshotRestorer, takeSnapshot } from '@nomicfoundation/hardhat-network-helpers'

chai.use(require('chai-as-promised'))

const { w3f } = hre
const { expect } = chai

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
        const { result } = await governanceExecutorW3F.run('onRun')

        expect(result.canExec).to.equal(false)
        !result.canExec && expect(result.message).to.equal('No actions to execute')
    })

    it('fails when domain is invalid', async () => {
        expect(governanceExecutorW3F.run('onRun', { userArgs: { domain: 'invalid-domain' } })).to.be.rejectedWith(
            'Fail to run web3 function: Error: Invalid domain: invalid-domain',
        )
    })

    // In order to implement these we need to mock creation of the proposal by the bridge validators
    // We need to deploy a payload, create a calldata telling the executor to execute the payload
    ////////////////////////////////////////////////////////////////////////////////////////
    // IValidatorContract validatorContract = IValidatorContract(L2_AMB_CROSS_DOMAIN_MESSENGER.validatorContract());
    // address[] memory validators = validatorContract.validatorList();
    // uint256 requiredSignatures = validatorContract.requiredSignatures();
    // bytes memory messageToRelay = removeFirst64Bytes(log.data);
    // for (uint256 i = 0; i < requiredSignatures; i++) {
    //     vm.prank(validators[i]);
    //     L2_AMB_CROSS_DOMAIN_MESSENGER.executeAffirmation(messageToRelay);
    // }
    ////////////////////////////////////////////////////////////////////////////////////////

    it.skip('does not execute actions when no actions are ready', async () => {
        // create one proposal, but not enough time has passed
    })

    it.skip('executes single proposal', async () => {
        // create one proposal, execute correctly when it's ready
    })

    it.skip('executes single proposal (second in timelock)', async () => {
        // create two proposals, execute one when it's ready, the second proposal awaiting
    })

    it.skip('executes multiple proposal', async () => {
        // create two proposals, execute both when they're' ready
    })
})
