import { Contract } from '@ethersproject/contracts'
import { Web3Function, Web3FunctionContext } from '@gelatonetwork/web3-functions-sdk'
import axios from 'axios'

import { forwarderAbi, forwarderArbitrumAbi, potAbi } from '../../abis'
import { addresses, sendMessageToSlack } from '../../utils'

Web3Function.onRun(async (context: Web3FunctionContext) => {
    const { multiChainProvider, userArgs, secrets } = context

    const provider = multiChainProvider.default()

    const forwarderAddress = userArgs.forwarder as string
    const maxDelta = BigInt(userArgs.maxDelta as string)
    const gasLimit = BigInt(userArgs.gasLimit as string)
    const isBridgingArbitrumStyle = userArgs.isBridgingArbitrumStyle as boolean
    const sendSlackMessages = userArgs.sendSlackMessages as boolean

    const slackWebhookUrl = (await secrets.get('SLACK_WEBHOOK_URL')) as string

    const forwarder = new Contract(forwarderAddress, forwarderAbi, provider)
    const pot = new Contract(addresses.mainnet.pot, potAbi, provider)

    const lastForwardedPotData = await forwarder.getLastSeenPotData()
    const currentDsr = await pot.dsr()

    if (
        BigInt(lastForwardedPotData.dsr) == BigInt(currentDsr) &&
        BigInt(Math.floor(new Date().getTime() / 1000)) <= BigInt(lastForwardedPotData.rho) + maxDelta
    ) {
        return {
            canExec: false,
            message: 'Pot data refresh not needed',
        }
    }

    let domainAlias = forwarderAddress
    if (forwarderAddress == addresses.mainnet.dsrForwarders.arbitrum) domainAlias = 'Arbitrum'
    if (forwarderAddress == addresses.mainnet.dsrForwarders.base) domainAlias = 'Base'
    if (forwarderAddress == addresses.mainnet.dsrForwarders.optimism) domainAlias = 'Optimism'

    const slackMessage = `\`\`\`🦾🔮 DSR Oracle Keeper 🦾🔮\nFeed refresh to be sent to ${domainAlias}\`\`\``

    if (isBridgingArbitrumStyle) {
        const maxFeePerGas = BigInt(userArgs.maxFeePerGas as string)
        const baseFee = BigInt(userArgs.baseFee as string)

        const forwarderArbitrum = new Contract(forwarderAddress, forwarderArbitrumAbi, provider)

        if (sendSlackMessages) {
            await sendMessageToSlack(axios, slackWebhookUrl)(slackMessage)
        }

        return {
            canExec: true,
            callData: [
                {
                    to: forwarderAddress,
                    data: forwarderArbitrum.interface.encodeFunctionData('refresh', [gasLimit, maxFeePerGas, baseFee]),
                },
            ],
        }
    }

    if (sendSlackMessages) {
        await sendMessageToSlack(axios, slackWebhookUrl)(slackMessage)
    }

    return {
        canExec: true,
        callData: [
            {
                to: forwarderAddress,
                data: forwarder.interface.encodeFunctionData('refresh', [gasLimit]),
            },
        ],
    }
})
