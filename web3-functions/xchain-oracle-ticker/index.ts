import { Contract } from '@ethersproject/contracts'
import { BigNumber, utils, providers } from 'ethers'
import { Web3Function, Web3FunctionContext } from '@gelatonetwork/web3-functions-sdk'
import axios from 'axios'

import { forwarderAbi, forwarderArbitrumAbi, multicallAbi, potAbi } from '../../abis'
import { addresses, sendMessageToSlack } from '../../utils'

const arbitrumDomainUrls: Record<string, string> = {
    [`${addresses.mainnet.dsrForwarders.arbitrumStyle.arbitrum}`]: 'https://arb1.arbitrum.io/rpc',
}

Web3Function.onRun(async (context: Web3FunctionContext) => {
    const { multiChainProvider, userArgs, secrets } = context

    const provider = multiChainProvider.default()

    const maxDelta = BigInt(userArgs.maxDelta as string)
    const gasLimit = BigInt(userArgs.gasLimit as string)
    const sendSlackMessages = userArgs.sendSlackMessages as boolean

    const slackWebhookUrl = (await secrets.get('SLACK_WEBHOOK_URL')) as string
    const generateSlackMessage = (domainAlias: string) => `\`\`\`🦾🔮 DSR Oracle Keeper 🦾🔮\nFeed refresh to be sent to ${domainAlias}\`\`\``

    const optimismStyleForwarderAddresses = addresses.mainnet.dsrForwarders.optimismStyle
    const arbitrumStyleForwarderAddresses = addresses.mainnet.dsrForwarders.arbitrumStyle

    const multicall = new Contract(addresses.mainnet.multicall, multicallAbi, provider)
    const pot = new Contract(addresses.mainnet.pot, potAbi, provider)
    const currentDsr = await pot.dsr()
    const latestTimestamp = await provider.getBlock('latest').then((block) => block.timestamp)

    const callsToExecute: Array<{to: string; data: string}> = []
    const slackMessages: Array<string> = []

    const multicallCalls: Array<{ target: string; callData: string }> = []

    const forwarderInterface = new utils.Interface(forwarderAbi)
    for (const forwarderAddress of [...Object.values(optimismStyleForwarderAddresses), ...Object.values(arbitrumStyleForwarderAddresses)]) {
        multicallCalls.push({
            target: forwarderAddress,
            callData: forwarderInterface.encodeFunctionData('getLastSeenPotData', []),
        })
    }
    let multicallResults = (await multicall.callStatic.aggregate(multicallCalls)).returnData

    for (const [domain, forwarderAddress] of Object.entries(optimismStyleForwarderAddresses)) {
        const lastForwardedPotData = forwarderInterface.decodeFunctionResult('getLastSeenPotData', multicallResults[0])[0]
        multicallResults = multicallResults.slice(1)
        if (
            (BigInt(lastForwardedPotData.dsr) != BigInt(currentDsr)) ||
            (BigInt(latestTimestamp) > (BigInt(lastForwardedPotData.rho) + maxDelta))
        ) {
            slackMessages.push(generateSlackMessage(domain))
            callsToExecute.push({
                to: forwarderAddress,
                data: forwarderInterface.encodeFunctionData('refresh', [gasLimit]),
            })
        }
    }

    const arbitrumForwarderInterface = new utils.Interface(forwarderArbitrumAbi)

    for (const [domain, forwarderAddress] of Object.entries(arbitrumStyleForwarderAddresses)) {
        if (arbitrumDomainUrls[forwarderAddress] == undefined) {
            continue // Domain not supported
        }
        const arbitrumProvider = new providers.JsonRpcProvider(arbitrumDomainUrls[forwarderAddress])
        const baseFee = (await arbitrumProvider.getGasPrice()).mul(1025)
        const maxFeePerGas = baseFee.add(baseFee.mul(20).div(100))

        const lastForwardedPotData = forwarderInterface.decodeFunctionResult('getLastSeenPotData', multicallResults[0])[0]
        multicallResults = multicallResults.slice(1)
        if (
            (BigInt(lastForwardedPotData.dsr) != BigInt(currentDsr)) ||
            (BigInt(latestTimestamp) > (BigInt(lastForwardedPotData.rho) + maxDelta))
        ) {
            slackMessages.push(generateSlackMessage(domain))
            callsToExecute.push({
                to: forwarderAddress,
                data: arbitrumForwarderInterface.encodeFunctionData('refresh', [gasLimit, maxFeePerGas, baseFee]),
            })
        }
    }

    if (callsToExecute.length == 0) {
        return {
            canExec: false,
            message: 'Pot data refresh not needed',
        }
    }

    if (sendSlackMessages) {
        await Promise.all(slackMessages.map((message) => sendMessageToSlack(axios, slackWebhookUrl)(message)))
    }
    return {
        canExec: true,
        callData: callsToExecute,
    }
})
