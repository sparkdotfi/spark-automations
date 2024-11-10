import { Contract } from '@ethersproject/contracts'
import { Web3Function, Web3FunctionContext } from '@gelatonetwork/web3-functions-sdk'
import axios from 'axios'

import { multicallAbi, gnosisGovernanceExecutorAbi, baseGovernanceExecutorAbi } from '../../abis'
import { addresses, sendMessageToSlack } from '../../utils'

const foreignDomainAliases = ['gnosis', 'base'] as const
type ForeignDomainAlias = (typeof foreignDomainAliases)[number]

Web3Function.onRun(async (context: Web3FunctionContext) => {
    const { multiChainProvider, userArgs, secrets } = context

    const domain = userArgs.domain as ForeignDomainAlias
    const sendSlackMessages = userArgs.sendSlackMessages as boolean

    const slackWebhookUrl = (await secrets.get('SLACK_WEBHOOK_URL')) as string

    let remoteExecutorAbi
    if (domain === 'gnosis') {
        remoteExecutorAbi = gnosisGovernanceExecutorAbi
    } else if (domain === 'base') {
        remoteExecutorAbi = baseGovernanceExecutorAbi
    } else {
        return {
            canExec: false,
            message: `Invalid domain: ${domain}`,
        }
    }

    const executorAddress = addresses[domain].executor
    const multicallAddress = addresses[domain].multicall

    const provider = multiChainProvider.default()

    const executor = new Contract(executorAddress, remoteExecutorAbi, provider)
    const multicall = new Contract(multicallAddress, multicallAbi, provider)

    let actionSetCount = 0
    if (domain === 'gnosis') {
        actionSetCount = Number(await executor.getActionsSetCount())
    }
    if (domain === 'base') {
        actionSetCount = Number(await executor.actionsSetCount())
    }

    const latestBlockTimestamp = (await provider.getBlock('latest')).timestamp

    const multicallCalls: Array<{ target: string; callData: string }> = []
    const callsToExecute: Array<{ to: string; data: string }> = []
    const messages: Array<string> = []

    for (let i = 0; i < actionSetCount; i++) {
        multicallCalls.push({
            target: executorAddress,
            callData: executor.interface.encodeFunctionData('getCurrentState', [i]),
        })
        multicallCalls.push({
            target: executorAddress,
            callData: executor.interface.encodeFunctionData('getActionsSetById', [i]),
        })
    }

    let multicallResults = (await multicall.callStatic.aggregate(multicallCalls)).returnData

    for (let i = 0; i < actionSetCount; i++) {
        const currentState = Number(executor.interface.decodeFunctionResult('getCurrentState', multicallResults[0])[0])
        const actionsSet = executor.interface.decodeFunctionResult('getActionsSetById', multicallResults[1])[0]

        multicallResults = multicallResults.slice(2)

        if (currentState == 0 && latestBlockTimestamp >= BigInt(actionsSet.executionTime)) {
            messages.push(`- ${actionsSet.targets[0]}`)
            callsToExecute.push({
                to: executorAddress,
                data: executor.interface.encodeFunctionData('execute', [i]),
            })
        }
    }

    if (callsToExecute.length == 0) {
        return {
            canExec: false,
            message: 'No actions to execute',
        }
    }

    if (sendSlackMessages) {
        await sendMessageToSlack(
            axios,
            slackWebhookUrl,
        )(`\`\`\`🦾🪄 Governance Executor Keeper 🦾🪄
Domain: ${domain}
Spells to execute:
${messages.join('\n')}\`\`\``)
    }

    return {
        canExec: true,
        callData: callsToExecute,
    }
})
