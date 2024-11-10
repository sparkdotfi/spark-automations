import hre from 'hardhat'
import chai from 'chai'
import { Contract, ContractFactory } from '@ethersproject/contracts'
import { Web3FunctionHardhat } from '@gelatonetwork/web3-functions-sdk/hardhat-plugin'
import { Web3FunctionResultCallData } from '@gelatonetwork/web3-functions-sdk/*'
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'
import {
    SnapshotRestorer,
    impersonateAccount,
    mine,
    setBalance,
    takeSnapshot,
} from '@nomicfoundation/hardhat-network-helpers'
import { baseGovernanceExecutorAbi } from '../../../abis'
import { addresses } from '../../../utils'

const { w3f, ethers } = hre
const { expect } = chai

describe('GovernanceExecutor', function () {
    this.timeout(0)

    let cleanStateRestorer: SnapshotRestorer
    let snapshotRestorer: SnapshotRestorer

    let governanceExecutorW3F: Web3FunctionHardhat
    let keeper: SignerWithAddress

    let payloadFactory: ContractFactory

    let executor: Contract
    let mockReceiver: Contract

    let executorAddress: string
    let executionDelay: number

    const userArgs = { domain: 'base', sendSlackMessages: false }

    before(async () => {
        cleanStateRestorer = await takeSnapshot()
        ;[keeper] = await ethers.getSigners()

        executorAddress = addresses.base.executor
        const mockReceiverFactory = await ethers.getContractFactory('MockReceiver')
        mockReceiver = await mockReceiverFactory.deploy(executorAddress)

        await setBalance(executorAddress, ethers.utils.parseEther('1'))
        await impersonateAccount(executorAddress)
        const executorSigner = await ethers.getSigner(executorAddress)
        executor = new Contract(executorAddress, baseGovernanceExecutorAbi, executorSigner)
        const submissionRole = await executor.SUBMISSION_ROLE()
        await executor.grantRole(submissionRole, mockReceiver.address)
        executionDelay = Number(await executor.delay())

        payloadFactory = await ethers.getContractFactory('EmptyPayload')

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
        const { result } = await governanceExecutorW3F.run('onRun', { userArgs })

        expect(result.canExec).to.equal(false)
        !result.canExec && expect(result.message).to.equal('No actions to execute')
    })

    it('fails when domain is invalid', async () => {
        const { result } = await governanceExecutorW3F.run('onRun', {
            userArgs: { domain: 'invalid-domain', sendSlackMessages: false },
        })

        expect(result.canExec).to.equal(false)
        !result.canExec && expect(result.message).to.equal('Invalid domain: invalid-domain')
    })

    it('does not execute actions when no actions are ready', async () => {
        const payload = await payloadFactory.deploy()
        await mockReceiver.__callQueueOnExecutor(payload.address)

        const { result } = await governanceExecutorW3F.run('onRun', { userArgs })

        expect(result.canExec).to.equal(false)
        !result.canExec && expect(result.message).to.equal('No actions to execute')
    })

    it('executes single proposal', async () => {
        const payload = await payloadFactory.deploy()
        await mockReceiver.__callQueueOnExecutor(payload.address)

        await mine(2, { interval: executionDelay - 2 })

        const { result: negativeResult } = await governanceExecutorW3F.run('onRun', { userArgs })
        expect(negativeResult.canExec).to.equal(false)

        await mine(2, { interval: 2 })

        const { result: positiveResult } = await governanceExecutorW3F.run('onRun', { userArgs })

        expect(positiveResult.canExec).to.equal(true)

        if (!positiveResult.canExec) {
            throw ''
        }
        const callData = positiveResult.callData as Web3FunctionResultCallData[]

        expect(callData).to.deep.equal([
            {
                to: executorAddress,
                data: executor.interface.encodeFunctionData('execute', [0]),
            },
        ])

        expect(await executor.getCurrentState(0)).to.equal(0)

        await keeper.sendTransaction({
            to: callData[0].to,
            data: callData[0].data,
        })

        expect(await executor.getCurrentState(0)).to.equal(1)
    })

    it('executes single proposal (second in timelock)', async () => {
        const firstPayload = await payloadFactory.deploy()
        const secondPayload = await payloadFactory.deploy()

        await mockReceiver.__callQueueOnExecutor(firstPayload.address)

        await mine(2, { interval: executionDelay - 2 })

        await mockReceiver.__callQueueOnExecutor(secondPayload.address)

        const { result: negativeResult } = await governanceExecutorW3F.run('onRun', { userArgs })
        expect(negativeResult.canExec).to.equal(false)

        await mine(2, { interval: 2 })

        const { result: positiveResult } = await governanceExecutorW3F.run('onRun', { userArgs })

        expect(positiveResult.canExec).to.equal(true)

        if (!positiveResult.canExec) {
            throw ''
        }
        const callData = positiveResult.callData as Web3FunctionResultCallData[]

        expect(callData).to.deep.equal([
            {
                to: executorAddress,
                data: executor.interface.encodeFunctionData('execute', [0]),
            },
        ])

        expect(await executor.getCurrentState(0)).to.equal(0)

        await keeper.sendTransaction({
            to: callData[0].to,
            data: callData[0].data,
        })

        expect(await executor.getCurrentState(0)).to.equal(1)
    })

    it('executes multiple proposals', async () => {
        const firstPayload = await payloadFactory.deploy()
        const secondPayload = await payloadFactory.deploy()

        await mockReceiver.__callQueueOnExecutor(firstPayload.address)
        await mockReceiver.__callQueueOnExecutor(secondPayload.address)

        await mine(2, { interval: executionDelay - 2 })

        const { result: negativeResult } = await governanceExecutorW3F.run('onRun', { userArgs })
        expect(negativeResult.canExec).to.equal(false)

        await mine(2, { interval: 2 })

        const { result: positiveResult } = await governanceExecutorW3F.run('onRun', { userArgs })

        expect(positiveResult.canExec).to.equal(true)

        if (!positiveResult.canExec) {
            throw ''
        }
        const callData = positiveResult.callData as Web3FunctionResultCallData[]

        expect(callData).to.deep.equal([
            {
                to: executorAddress,
                data: executor.interface.encodeFunctionData('execute', [0]),
            },
            {
                to: executorAddress,
                data: executor.interface.encodeFunctionData('execute', [1]),
            },
        ])

        expect(await executor.getCurrentState(0)).to.equal(0)
        expect(await executor.getCurrentState(1)).to.equal(0)

        await keeper.sendTransaction({
            to: callData[0].to,
            data: callData[0].data,
        })
        await keeper.sendTransaction({
            to: callData[1].to,
            data: callData[1].data,
        })

        expect(await executor.getCurrentState(0)).to.equal(1)
        expect(await executor.getCurrentState(1)).to.equal(1)
    })
})
