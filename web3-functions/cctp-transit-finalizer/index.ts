import { Web3Function, Web3FunctionContext } from '@gelatonetwork/web3-functions-sdk'
import axios from 'axios'

import { addresses, gasAboveAverage, getBlockNumberAtOrBefore, UnixTime } from '../../utils'

type Web3FunctionMultiChainProvider = Web3FunctionContext['multiChainProvider']


export interface CctpInitialization {
  txHash: string
  transitId: TransitId
}

const supportedChainIds = [1, 8453] as const
type SupportedChainId = typeof supportedChainIds[number]


const supportedCctpDomainIds = [0, 6] as const
type SupportedCctpDomainId = typeof supportedCctpDomainIds[number]

export type TransitId = `${SupportedCctpDomainId}-${SupportedCctpDomainId}-${bigint}`

const almControllerAddresses = {
    1: addresses.mainnet.almController,
    8453: addresses.base.almController,
} as const

Web3Function.onRun(async (context: Web3FunctionContext) => {
    const { multiChainProvider, userArgs, gelatoArgs, secrets } = context

    const keepersChainId = gelatoArgs.chainId as SupportedChainId

    const performGasCheck = userArgs.performGasCheck as boolean
    const sendSlackMessages = userArgs.sendSlackMessages as boolean
    const initializationLookupRangeStart = userArgs.initializationLookupRangeStart
    const initializationLookupRangeEnd = userArgs.initializationLookupRangeEnd

    const currentTimestamp = UnixTime.fromDate(new Date())
    const initializationLookupRangeStartTimestamp = UnixTime(currentTimestamp - UnixTime(initializationLookupRangeStart)) // load from userArgs the time of how far back to look for initialization events i.e. we want not older than 24 hours
    const initializationLookupRangeEndTimestamp = UnixTime(currentTimestamp - UnixTime(initializationLookupRangeEnd)) // load from userArgs the time of how stale the initialization events should be i.e. we want not fresher than 2 hours

    const etherscanApiKey = (await secrets.get('ETHERSCAN_API_KEY')) as string
    const slackWebhookUrl = (await secrets.get('SLACK_WEBHOOK_URL')) as string

    const currentGasPrice = BigInt(gelatoArgs.gasPrice.toString())
    if (performGasCheck && (await gasAboveAverage(axios, etherscanApiKey, currentGasPrice)())) {
        return {
            canExec: false,
            message: 'Gas above average',
        }
    }

    for (const chainId of supportedChainIds) {
        const initializationEvents = await fetchInitializationEvents(multiChainProvider, {
            initializationLookupRangeStartTimestamp,
            initializationLookupRangeEndTimestamp,
            chainId,
            almControllerAddress: almControllerAddresses[chainId],
        })
        console.log(initializationEvents)

        // TODO Filter out all events that are not targeting the domain the keeper is deployed to

        // TODO:
        // 1. Find the oldest initialization event
        // 2. Get the timestamp of the block it was included in
        // 3. Find a block number in the keeper domain with the timestamp of the block from step 2
    }

        // TODO Figure out the oldest initialization from all supported chains

        // TODO Fetch all finalizations from the block number found in step 3 until the latest block on the keeper's domain
        //      Transform them into a more usable format

        // TODO Try to match all initializations with one of the finalizations

        // TODO For each initialization that has no matching finalization, send a slack message and execute the finalization


    return {
        canExec: false,
        message: 'Not implemented',
    }
})

interface FetchInitializationEventsArgs {
    initializationLookupRangeStartTimestamp: UnixTime
    initializationLookupRangeEndTimestamp: UnixTime
    chainId: SupportedChainId
    almControllerAddress: string
}

async function fetchInitializationEvents(multiChainProvider: Web3FunctionMultiChainProvider, args: FetchInitializationEventsArgs): Promise<Log[]> {
    const provider = multiChainProvider.chainId(args.chainId)
    const fromBlock = await getBlockNumberAtOrBefore({
        provider,
        timestamp: args.initializationLookupRangeStartTimestamp,
    })
    const toBlock = await getBlockNumberAtOrBefore({
        provider,
        timestamp: args.initializationLookupRangeEndTimestamp,
    })

    const rawLogs = await provider.getLogs({
        address: args.almControllerAddress,
        topics: [], // TODO ALM Controller CCTP Initialization Event Topic
        fromBlock,
        toBlock,
    })

    return rawLogs // TODO parse logs and transform them into a more usable format
}
