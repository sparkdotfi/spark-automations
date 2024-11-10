
import { Log, StaticJsonRpcProvider } from '@ethersproject/providers'

interface FetchInitializationEventsArgs {
    fromBlock: number
    toBlock: number
    almControllerAddress: string
}

export async function fetchInitializationEvents(provider: StaticJsonRpcProvider, args: FetchInitializationEventsArgs): Promise<Log[]> {
    const rawLogs = await provider.getLogs({
        address: args.almControllerAddress,
        fromBlock: args.fromBlock,
        toBlock: args.toBlock,
    })
    console.log({rawLogs})
    return rawLogs // TODO parse logs and transform them into a more usable format
}
