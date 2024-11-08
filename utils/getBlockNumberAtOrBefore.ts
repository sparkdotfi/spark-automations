import { StaticJsonRpcProvider } from '@ethersproject/providers'

import { UnixTime } from '.'

export async function getBlockNumberAtOrBefore(args: {
    provider: StaticJsonRpcProvider
    timestamp: UnixTime
    start?: number
    end?: number
  }): Promise<number> {
    const timestamp = args.timestamp
    let start = args.start ?? 1
    let end = args.end ?? await args.provider.getBlockNumber()

    const getBlockTimestamp = async (blockNumber: number) => {
        const block = await args.provider.getBlock(blockNumber)
        return UnixTime(block.timestamp)
      }

    while (start + 1 < end) {
      const mid = start + (end - start) / 2
      const midTimestamp = await getBlockTimestamp(mid)

      if (midTimestamp <= timestamp) {
        start = mid
      } else {
        end = mid
      }
    }

    return start
  }
