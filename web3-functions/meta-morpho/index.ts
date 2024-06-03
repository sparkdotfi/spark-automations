import { Contract } from '@ethersproject/contracts'
import { Web3Function, Web3FunctionContext } from '@gelatonetwork/web3-functions-sdk'

import { metaMorphoAbi, multicallAbi } from '../../abis'
import { addresses, calculateMetaMorphoMarketId } from '../../utils'

type MarketParams = {
    loanToken: string
    collateralToken: string
    oracle: string
    irm: string
    lltv: string
}

Web3Function.onRun(async (context: Web3FunctionContext) => {
    const { multiChainProvider, userArgs } = context

    const provider = multiChainProvider.default()

    const marketParams_loanToken = userArgs.marketParams_loanToken as Array<string>
    const marketParams_collateralToken = userArgs.marketParams_collateralToken as Array<string>
    const marketParams_oracle = userArgs.marketParams_oracle as Array<string>
    const marketParams_irm = userArgs.marketParams_irm as Array<string>
    const marketParams_lltv = userArgs.marketParams_lltv as Array<string>

    if (
        marketParams_loanToken.length !== marketParams_collateralToken.length ||
        marketParams_loanToken.length !== marketParams_oracle.length ||
        marketParams_loanToken.length !== marketParams_irm.length ||
        marketParams_loanToken.length !== marketParams_lltv.length
    ) {
        throw new Error('Configuration error: marketParams arrays must have the same length')
    }

    const markets: Record<string, MarketParams> = {}

    for (let i = 0; i < marketParams_loanToken.length; i++) {
        const marketId = calculateMetaMorphoMarketId(
            marketParams_loanToken[i],
            marketParams_collateralToken[i],
            marketParams_oracle[i],
            marketParams_irm[i],
            marketParams_lltv[i],
        )

        markets[marketId] = {
            loanToken: marketParams_loanToken[i],
            collateralToken: marketParams_collateralToken[i],
            oracle: marketParams_oracle[i],
            irm: marketParams_irm[i],
            lltv: marketParams_lltv[i],
        }
    }

    const metaMorpho = new Contract(addresses.mainnet.metaMorpho, metaMorphoAbi, provider)
    const multicall = new Contract(addresses.mainnet.multicall, multicallAbi, provider)

    const multicallCalls: Array<{ target: string; callData: string }> = []

    for (const marketId of Object.keys(markets)) {
        multicallCalls.push({
            target: metaMorpho.address,
            callData: metaMorpho.interface.encodeFunctionData('pendingCap', [marketId]),
        })
    }

    const latestTimestamp = await provider.getBlock('latest').then((block) => block.timestamp)

    const multicallResults = (await multicall.callStatic.aggregate(multicallCalls)).returnData

    const callsToExecute: Array<{ to: string; data: string }> = []

    Object.keys(markets).forEach((marketId, index) => {
        const { validAt } = metaMorpho.interface.decodeFunctionResult('pendingCap', multicallResults[index])
        if (validAt != 0 && validAt <= latestTimestamp) {
            callsToExecute.push({
                to: metaMorpho.address,
                data: metaMorpho.interface.encodeFunctionData('acceptCap', [Object.values(markets[marketId])]),
            })
        }
    })

    return callsToExecute.length > 0
        ? {
              canExec: true,
              callData: callsToExecute,
          }
        : {
              canExec: false,
              message: 'No pending caps to be accepted',
          }
})
