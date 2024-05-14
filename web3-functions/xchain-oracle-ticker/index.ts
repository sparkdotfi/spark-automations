import { Contract } from '@ethersproject/contracts'
import { Web3Function, Web3FunctionContext } from '@gelatonetwork/web3-functions-sdk'

import { forwarderAbi, forwarderArbitrumAbi, potAbi } from '../../abis'
import { addresses } from '../../utils'

Web3Function.onRun(async (context: Web3FunctionContext) => {
    const { multiChainProvider, userArgs } = context

    const provider = multiChainProvider.default()

    const forwarderAddress = userArgs.forwarder as string
    const maxDelta = BigInt(userArgs.maxDelta as string)
    const gasLimit = BigInt(userArgs.gasLimit as string)
    const isBridgingArbitrumStyle = userArgs.isBridgingArbitrumStyle as boolean

    const forwarder = new Contract(forwarderAddress, forwarderAbi, provider)
    const pot = new Contract(addresses.mainnet.pot, potAbi, provider)

    const lastForwardedPotData = await forwarder.getLastSeenPotData()
    const currentDsr = await pot.dsr()

    console.log(BigInt(lastForwardedPotData.rho))
    console.log(BigInt(Math.floor(new Date().getTime() / 1000)))
    console.log(maxDelta)


    if (
        BigInt(lastForwardedPotData.dsr) == BigInt(currentDsr)
        && block.timestamp < potData.rho + maxDelta
    ) {
        return {
            canExec: false,
            message: 'Pot data refresh not needed',
        }
    }

    if (isBridgingArbitrumStyle) {
        const maxFeePerGas = BigInt(userArgs.maxFeePerGas as string)
        const baseFee = BigInt(userArgs.baseFee as string)

        const forwarderArbitrum = new Contract(forwarderAddress, forwarderArbitrumAbi, provider)

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
