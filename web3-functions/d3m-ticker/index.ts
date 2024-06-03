import { Contract } from '@ethersproject/contracts'
import { Web3Function, Web3FunctionContext } from '@gelatonetwork/web3-functions-sdk'
import axios from 'axios'

import { d3mHubAbi, multicallAbi, vatAbi } from '../../abis'
import { addresses, gasAboveAverage, ilk } from '../../utils'

Web3Function.onRun(async (context: Web3FunctionContext) => {
    const { multiChainProvider, userArgs, gelatoArgs, secrets } = context

    const performGasCheck = userArgs.performGasCheck as boolean
    const currentGasPrice = BigInt(gelatoArgs.gasPrice.toString())

    const etherscanApiKey = await secrets.get("COINGECKO_API_KEY") as string

    if (performGasCheck && (await gasAboveAverage(axios, etherscanApiKey, currentGasPrice)())) {
        return {
            canExec: false,
            message: 'Gas above average',
        }
    }

    const provider = multiChainProvider.default()
    const threshold = BigInt(userArgs.threshold as string)

    const d3mHub = new Contract(addresses.mainnet.d3mHub, d3mHubAbi, provider)
    const multicall = new Contract(addresses.mainnet.multicall, multicallAbi, provider)
    const vat = new Contract(addresses.mainnet.vat, vatAbi, provider)

    const [, artBefore] = await vat.urns(ilk, addresses.mainnet.d3mPool)

    const [, artAfterData] = (
        await multicall.callStatic.aggregate([
            {
                target: addresses.mainnet.d3mHub,
                callData: d3mHub.interface.encodeFunctionData('exec', [ilk]),
            },
            {
                target: addresses.mainnet.vat,
                callData: vat.interface.encodeFunctionData('urns', [ilk, addresses.mainnet.d3mPool]),
            },
        ])
    ).returnData

    const artAfter = vat.interface.decodeFunctionResult('urns', artAfterData).art

    const artDifference =
        BigInt(artBefore) > BigInt(artAfter)
            ? BigInt(artBefore) - BigInt(artAfter)
            : BigInt(artAfter) - BigInt(artBefore)

    if (artDifference >= threshold) {
        return {
            canExec: true,
            callData: [
                {
                    to: addresses.mainnet.d3mHub,
                    data: d3mHub.interface.encodeFunctionData('exec', [ilk]),
                },
            ],
        }
    }

    return {
        canExec: false,
        message: 'Threshold not met',
    }
})
