import { Contract } from '@ethersproject/contracts'
import { Web3Function, Web3FunctionContext } from '@gelatonetwork/web3-functions-sdk'
import axios from 'axios'

import { metaMorphoAbi, morphoAbi, multicallAbi } from '../../abis'
import { addresses, sendMessageToSlack } from '../../utils'

Web3Function.onRun(async (context: Web3FunctionContext) => {
    const { multiChainProvider, userArgs, secrets } = context

    const sendSlackMessages = userArgs.sendSlackMessages as boolean

    const slackWebhookUrl = (await secrets.get('SLACK_WEBHOOK_URL')) as string

    const provider = multiChainProvider.default()

    const metaMorpho = new Contract(addresses.mainnet.metaMorpho, metaMorphoAbi, provider)
    const morpho = new Contract(await metaMorpho.MORPHO(), morphoAbi, provider)
    const multicall = new Contract(addresses.mainnet.multicall, multicallAbi, provider)

    const logs = await provider.getLogs({
        address: addresses.mainnet.metaMorpho,
        topics: [metaMorpho.interface.getEventTopic('SubmitCap')],
        fromBlock: 19875940,
    })

    const marketIds = logs.map((log) => metaMorpho.interface.parseLog(log)).map((parsedLog) => parsedLog.args.id)

    const multicallCalls: Array<{ target: string; callData: string }> = []

    for (const marketId of marketIds) {
        multicallCalls.push({
            target: metaMorpho.address,
            callData: metaMorpho.interface.encodeFunctionData('pendingCap', [marketId]),
        })
        multicallCalls.push({
            target: morpho.address,
            callData: morpho.interface.encodeFunctionData('idToMarketParams', [marketId]),
        })
    }

    const latestTimestamp = await provider.getBlock('latest').then((block) => block.timestamp)

    const multicallResults = (await multicall.callStatic.aggregate(multicallCalls)).returnData

    const callsToExecute: Array<{ to: string; data: string }> = []

    marketIds.forEach((_, index) => {
        const { validAt } = metaMorpho.interface.decodeFunctionResult('pendingCap', multicallResults[index * 2])
        const marketParams = morpho.interface.decodeFunctionResult('idToMarketParams', multicallResults[index * 2 + 1])
        if (validAt != 0 && validAt <= latestTimestamp) {
            callsToExecute.push({
                to: metaMorpho.address,
                data: metaMorpho.interface.encodeFunctionData('acceptCap', [marketParams.slice(0, 5)]),
            })
        }
    })

    if (callsToExecute.length == 0) {
        return {
            canExec: false,
            message: 'No pending caps to be accepted',
        }
    }

    if (sendSlackMessages) {
        await sendMessageToSlack(
            axios,
            slackWebhookUrl,
        )(`\`\`\`🦾🦋 Morpho Cap Keeper 🦾🦋
\n${callsToExecute.length} cap update${callsToExecute.length > 1 ? 's' : ''} to be executed\`\`\``)
    }

    return {
        canExec: true,
        callData: callsToExecute,
    }
})
