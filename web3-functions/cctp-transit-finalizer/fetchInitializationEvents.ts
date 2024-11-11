import { Contract } from '@ethersproject/contracts'
import { StaticJsonRpcProvider } from '@ethersproject/providers'

import { almControllerAbi } from '../../abis'
import { CctpTransitInitialization } from '.'

interface FetchInitializationEventsArgs {
    fromBlock: number
    toBlock: number
    almControllerAddress: string
    sourceDomainCctpAlias: number
    destinationDomainCctpAlias: number
}

export async function fetchInitializationEvents(
    provider: StaticJsonRpcProvider,
    args: FetchInitializationEventsArgs,
): Promise<CctpTransitInitialization[]> {
    const controller = new Contract(args.almControllerAddress, almControllerAbi, provider)

    const rawLogs = await provider.getLogs({
        address: args.almControllerAddress,
        topics: [controller.interface.getEventTopic('CCTPTransferInitiated')],
        fromBlock: args.fromBlock,
        toBlock: args.toBlock,
    })

    const transitInitializations = rawLogs
        .map((log) => ({
            nonce: controller.interface.parseLog(log).args.nonce,
            sourceDomain: args.sourceDomainCctpAlias,
            destinationDomain: controller.interface.parseLog(log).args.destinationDomain,
            txHash: log.transactionHash,
        }))
        .filter((initialization) => initialization.destinationDomain === args.destinationDomainCctpAlias)

    return transitInitializations
}
