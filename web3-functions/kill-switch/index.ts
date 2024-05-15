import { Contract } from '@ethersproject/contracts'
import { Web3Function, Web3FunctionContext } from '@gelatonetwork/web3-functions-sdk'

import { killSwitchOracleAbi, multicallAbi, oracleAbi } from '../../abis'
import { addresses } from '../../utils'

Web3Function.onRun(async (context: Web3FunctionContext) => {
    const { multiChainProvider } = context

    const provider = multiChainProvider.default()

    const multicall = new Contract(addresses.mainnet.multicall, multicallAbi, provider)
    const killSwitchOracle = new Contract(addresses.mainnet.killSwitchOracle, killSwitchOracleAbi, provider)

    const oracleAddresses = await killSwitchOracle.oracles()

    let multicallCalls: Array<{ target: string; callData: string }> = []

    for (const oracleAddress of oracleAddresses) {
        const oracle = new Contract(oracleAddress, oracleAbi, provider)
        multicallCalls = [
            ...multicallCalls,
            ...[
                {
                    target: oracleAddress,
                    callData: oracle.interface.encodeFunctionData('latestAnswer'),
                },
                {
                    target: addresses.mainnet.killSwitchOracle,
                    callData: killSwitchOracle.interface.encodeFunctionData('oracleThresholds', [oracleAddress]),
                },
                {
                    target: addresses.mainnet.killSwitchOracle,
                    callData: killSwitchOracle.interface.encodeFunctionData('triggered'),
                },
            ],
        ]
    }

    let multicallResults = (await multicall.callStatic.aggregate(multicallCalls)).returnData

    for (const oracleAddress of oracleAddresses) {
        const oracle = new Contract(oracleAddress, oracleAbi, provider)

        const latestAnswer = BigInt(
            oracle.interface.decodeFunctionResult('latestAnswer', multicallResults[0])[0].toString(),
        )
        const threshold = BigInt(
            killSwitchOracle.interface.decodeFunctionResult('oracleThresholds', multicallResults[1])[0].toString(),
        )
        const triggered = killSwitchOracle.interface.decodeFunctionResult('triggered', multicallResults[2])[0]

        multicallResults = multicallResults.slice(3)

        if (!triggered && latestAnswer > 0 && latestAnswer <= threshold) {
            return {
                canExec: true,
                callData: [
                    {
                        to: addresses.mainnet.killSwitchOracle,
                        data: killSwitchOracle.interface.encodeFunctionData('trigger', [oracleAddress]),
                    },
                ],
            }
        }
    }

    return {
        canExec: false,
        message: 'No oracles met threshold',
    }
})
