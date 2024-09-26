import { Contract } from '@ethersproject/contracts'
import { Web3Function, Web3FunctionContext } from '@gelatonetwork/web3-functions-sdk'
import axios from 'axios'
import { utils } from 'ethers'

import { multicallAbi, ssrOptimismStyleForwarderAbi, susdsAbi } from '../../abis'
import { addresses, formatChi, formatDsr as formatSsr, formatTimestamp, sendMessageToSlack } from '../../utils'

Web3Function.onRun(async (context: Web3FunctionContext) => {
    const { multiChainProvider, userArgs, secrets } = context

    const provider = multiChainProvider.default()

    const maxDelta = BigInt(userArgs.maxDelta as string)
    const gasLimit = BigInt(userArgs.gasLimit as string)
    const sendSlackMessages = userArgs.sendSlackMessages as boolean

    const slackWebhookUrl = (await secrets.get('SLACK_WEBHOOK_URL')) as string

    const generateSlackMessageBit = (domainAlias: string, reason: string): string => `\n - ${domainAlias} (${reason})`
    const generateSlackMessage = (
        messageBits: Array<string>,
        currentSsr: string,
        currentChi: string,
        currentTimestamp: number,
    ): string =>
        `\`\`\`🦾🔮 SSR Oracle Keeper 🦾🔮\n
Timestamp: ${formatTimestamp(currentTimestamp)}
SSR: ${formatSsr(currentSsr)}
CHI: ${formatChi(currentChi)}
Feed refresh to be sent to:${messageBits.join('')}\`\`\``

    const optimismStyleForwarderAddresses = addresses.mainnet.ssrForwarders.optimismStyle

    const multicall = new Contract(addresses.mainnet.multicall, multicallAbi, provider)
    const susds = new Contract(addresses.mainnet.susds, susdsAbi, provider)

    const currentSsr = await susds.ssr()
    const currentChi = await susds.chi()
    const latestTimestamp = await provider.getBlock('latest').then((block) => block.timestamp)

    const callsToExecute: Array<{ to: string; data: string }> = []
    const slackMessageBits: Array<string> = []

    const multicallCalls: Array<{ target: string; callData: string }> = []

    const forwarderInterface = new utils.Interface(ssrOptimismStyleForwarderAbi)
    for (const forwarderAddress of [...Object.values(optimismStyleForwarderAddresses)]) {
        multicallCalls.push({
            target: forwarderAddress,
            callData: forwarderInterface.encodeFunctionData('getLastSeenSUSDSData', []),
        })
    }
    let multicallResults = (await multicall.callStatic.aggregate(multicallCalls)).returnData

    for (const [domain, forwarderAddress] of Object.entries(optimismStyleForwarderAddresses)) {
        const lastForwardedSUSDSData = forwarderInterface.decodeFunctionResult(
            'getLastSeenSUSDSData',
            multicallResults[0],
        )[0]

        multicallResults = multicallResults.slice(1)

        const outdatedSsr = BigInt(lastForwardedSUSDSData.ssr) != BigInt(currentSsr)
        const staleRho = BigInt(latestTimestamp) > BigInt(lastForwardedSUSDSData.rho) + maxDelta

        if (outdatedSsr || staleRho) {
            callsToExecute.push({
                to: forwarderAddress,
                data: forwarderInterface.encodeFunctionData('refresh', [gasLimit]),
            })

            const refreshReason = outdatedSsr
                ? `outdated ssr: ${formatSsr(lastForwardedSUSDSData.ssr.toString())}`
                : `stale rho: ${formatTimestamp(Number(lastForwardedSUSDSData.rho))}`

            slackMessageBits.push(generateSlackMessageBit(domain, refreshReason))
        }
    }

    if (callsToExecute.length == 0) {
        return {
            canExec: false,
            message: 'sUSDS data refresh not needed',
        }
    }

    if (sendSlackMessages) {
        await sendMessageToSlack(
            axios,
            slackWebhookUrl,
        )(generateSlackMessage(slackMessageBits, currentSsr.toString(), currentChi.toString(), latestTimestamp))
    }
    return {
        canExec: true,
        callData: callsToExecute,
    }
})
