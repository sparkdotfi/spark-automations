import { Web3Function, Web3FunctionContext } from '@gelatonetwork/web3-functions-sdk'

import { addresses } from '../../utils'

export interface CctpInitialization {
  txHash: string
  transitId: TransitId
}

const supportedChainIds = [1, 8453] as const
type SupportedChainId = typeof supportedChainIds[number]


const supportedCctpDomainIds = [0, 6] as const
type SupportedCctpDomainId = typeof supportedCctpDomainIds[number]

export type TransitId = `${SupportedCctpDomainId}-${SupportedCctpDomainId}-${bigint}`

const ESTIMATED_MAINNET_BLOCKS_PER_HOUR = 4 * 60
const ESTIMATED_BASE_BLOCKS_PER_HOUR = 32 * 60

const lookUpRanges = {
    1: {
        fromBlock: ESTIMATED_MAINNET_BLOCKS_PER_HOUR * 2,
        toBlock: ESTIMATED_MAINNET_BLOCKS_PER_HOUR * 24,
    },
    8453: {
        fromBlock: ESTIMATED_BASE_BLOCKS_PER_HOUR * 2,
        toBlock: ESTIMATED_BASE_BLOCKS_PER_HOUR * 24,
    }
} as const

const almControllerAddresses = {
    1: addresses.mainnet.almController,
    8453: addresses.base.almController,
} as const

Web3Function.onRun(async (context: Web3FunctionContext) => {
    const { multiChainProvider, userArgs, gelatoArgs, secrets } = context

    const keepersChainId = gelatoArgs.chainId as SupportedChainId

    const sendSlackMessages = userArgs.sendSlackMessages as boolean
    const slackWebhookUrl = (await secrets.get('SLACK_WEBHOOK_URL')) as string

    const sourceChainIds = supportedChainIds.filter((chainId) => chainId !== keepersChainId)

    for (const chainId of sourceChainIds) {

        const initializationEvents = await fetchInitializationEvents(multiChainProvider.chainId(chainId), {
            fromBlock: lookUpRanges[chainId].fromBlock,
            toBlock: lookUpRanges[chainId].toBlock,
            almControllerAddress: almControllerAddresses[chainId],
        })

        // TODO Filter out all events that are not targeting the domain the keeper is deployed to

        //  TODO For each initialization event, targeting this domain, call `usedNonces(bytes32)` on MessageTransmitter to check if the initialization has already been finalized
        //       For each not finalized initialization, add it to a list of initializations to finalize
    }

        // TODO For each initialization to finalize fetch message and attestation from CCTP API and order a finalization
        //      For each finalization, send a slack message if `sendSlackMessages` is true

    return {
        canExec: false,
        message: 'Not implemented',
    }
})
