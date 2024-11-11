import axios from 'axios'
import { Web3Function, Web3FunctionContext } from '@gelatonetwork/web3-functions-sdk'

import { addresses, sendMessageToSlack } from '../../utils'
import { fetchInitializationEvents } from './fetchInitializationEvents'
import { filterOutFinalizedInitializations } from './filterOutFinalizedInitializations'

export interface CctpTransitInitialization {
    nonce: number
    sourceDomain: number
    destinationDomain: number
    txHash: string
}

const supportedChains = ['mainnet', 'base'] as const
type SupportedChains = (typeof supportedChains)[number]

const isSupported = (name: string | undefined): name is SupportedChains => {
    return (supportedChains as readonly string[]).includes(name ?? '')
}

const supportedCctpDomainIds = {
    mainnet: 0,
    base: 6,
} as const

const ESTIMATED_MAINNET_BLOCKS_PER_HOUR = 4 * 60
const ESTIMATED_BASE_BLOCKS_PER_HOUR = 32 * 60

const lookUpRanges = {
    mainnet: {
        fromBlock: ESTIMATED_MAINNET_BLOCKS_PER_HOUR * 2,
        toBlock: ESTIMATED_MAINNET_BLOCKS_PER_HOUR * 24,
    },
    base: {
        fromBlock: ESTIMATED_BASE_BLOCKS_PER_HOUR * 2,
        toBlock: ESTIMATED_BASE_BLOCKS_PER_HOUR * 24,
    },
} as const

Web3Function.onRun(async (context: Web3FunctionContext) => {
    const { multiChainProvider, gelatoArgs, userArgs, secrets } = context
    const providers = {
        mainnet: multiChainProvider.chainId(1),
        base: multiChainProvider.chainId(8453),
    }

    const keepersChainId = gelatoArgs.chainId
    const sendSlackMessages = userArgs.sendSlackMessages as boolean

    const slackWebhookUrl = (await secrets.get('SLACK_WEBHOOK_URL')) as string

    let keepersChainName
    if (keepersChainId === 1) {
        keepersChainName = 'mainnet'
    } else if (keepersChainId === 8453) {
        keepersChainName = 'base'
    }

    if (!isSupported(keepersChainName)) {
        return {
            canExec: false,
            message: 'Chain not supported',
        }
    }

    const sourceChains = supportedChains.filter((chain) => chain !== keepersChainName)

    let combinedInitializations: CctpTransitInitialization[] = []

    for (const chainName of sourceChains) {
        const initializationEvents = await fetchInitializationEvents(providers[chainName], {
            fromBlock: lookUpRanges[chainName].fromBlock,
            toBlock: lookUpRanges[chainName].toBlock,
            almControllerAddress: addresses[chainName].almController,
            sourceDomainCctpAlias: supportedCctpDomainIds[chainName],
            destinationDomainCctpAlias: supportedCctpDomainIds[keepersChainName],
        })
        combinedInitializations = [...combinedInitializations, ...initializationEvents]
    }

    const nonFinalizedInitializations = await filterOutFinalizedInitializations(providers[keepersChainName], {
        initializations: combinedInitializations,
        multicallAddress: addresses[keepersChainName].messageTransmitter,
        messageTransmitterAddress: addresses[keepersChainName].multicall,
    })

    if (nonFinalizedInitializations.length === 0) {
        return {
            canExec: false,
            message: 'No pending initializations to finalize',
        }
    }

    if (sendSlackMessages) {
        const messageBits = nonFinalizedInitializations.map((initialization) => {
            return `${initialization.txHash}\nSource domain:     ${initialization.sourceDomain}\nDestination domain: ${initialization.destinationDomain}`
        })
        const messageHeader = '🦾💸 CCTP Finalization Keeper 🦾💸\nFollowing transits to be finalized:\n\n'

        const message = `\`\`\`${messageHeader}${messageBits.join('\n\n')}\`\`\``

        await sendMessageToSlack(axios, slackWebhookUrl)(message)
    }

    // TODO For each of the nonFinalizedInitializations
    //      1. Fetch message and attestation from CCTP API
    //      2. Create a call to finalize the initialization for Gelato

    return {
        canExec: false,
        message: 'Not implemented',
    }
})
