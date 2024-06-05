import { Contract } from '@ethersproject/contracts'
import { Web3Function, Web3FunctionContext } from '@gelatonetwork/web3-functions-sdk'

import { multicallAbi, remoteExecutorAbi } from '../../abis'
import { addresses } from '../../utils'

const foreignDomainAliases = ['gnosis'] as const
type ForeignDomainAlias = (typeof foreignDomainAliases)[number]

Web3Function.onRun(async (context: Web3FunctionContext) => {
    const { multiChainProvider, userArgs } = context

    const domain = userArgs.domain as ForeignDomainAlias
    if (foreignDomainAliases.indexOf(domain) === -1) {
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

    const actionSetCount = BigInt(await executor.getActionsSetCount())

    const latestBlockTimestamp = (await provider.getBlock('latest')).timestamp

    const multicallCalls: Array<{ target: string; callData: string }> = []
    const callsToExecute: Array<{ to: string; data: string }> = []

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
        const executionTime = BigInt(
            executor.interface.decodeFunctionResult('getActionsSetById', multicallResults[1])[0].executionTime,
        )
        multicallResults = multicallResults.slice(2)

        if (currentState == 0 && latestBlockTimestamp >= executionTime) {
            callsToExecute.push({
                to: executorAddress,
                data: executor.interface.encodeFunctionData('execute', [i]),
            })
        }
    }

    return callsToExecute.length > 0
        ? {
              canExec: true,
              callData: callsToExecute,
          }
        : {
              canExec: false,
              message: 'No actions to execute',
          }
})
