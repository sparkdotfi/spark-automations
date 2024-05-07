import axios from 'axios'
import { Contract } from '@ethersproject/contracts'
import { Web3Function, Web3FunctionContext } from '@gelatonetwork/web3-functions-sdk'

import { capAutomatorAbi, multicallAbi, poolAbi, protocolDataProviderAbi } from '../../abis'
import { addresses, gasAboveAverage } from '../../utils'

Web3Function.onRun(async (context: Web3FunctionContext) => {
    const { multiChainProvider, userArgs, gelatoArgs } = context

    const performGasCheck = userArgs.performGasCheck as boolean
    const currentGasPrice = BigInt(gelatoArgs.gasPrice.toString())

    if (performGasCheck && (await gasAboveAverage(axios, '', currentGasPrice)())) {
        return {
            canExec: false,
            message: 'Gas above average',
        }
    }

    const provider = multiChainProvider.default()
    const threshold = BigInt(userArgs.threshold as number)

    const pool = new Contract(addresses.mainnet.pool, poolAbi, provider)
    const protocolDataProvider = new Contract(addresses.mainnet.protocolDataProvider, protocolDataProviderAbi, provider)
    const capAutomator = new Contract(addresses.mainnet.capAutomator, capAutomatorAbi, provider)
    const multicall = new Contract(addresses.mainnet.multicall, multicallAbi, provider)

    const sparkAssets = (await pool.getReservesList()) as string[]

    const borrowCapUpdates = {} as Record<string, boolean>
    const supplyCapUpdates = {} as Record<string, boolean>

    let multicallCalls: Array<{ target: string; callData: string }> = []

    for (const assetAddress of sparkAssets) {
        multicallCalls = [
            ...multicallCalls,
            ...[
                {
                    target: addresses.mainnet.protocolDataProvider,
                    callData: protocolDataProvider.interface.encodeFunctionData('getReserveCaps', [assetAddress]),
                },
                {
                    target: addresses.mainnet.capAutomator,
                    callData: capAutomator.interface.encodeFunctionData('borrowCapConfigs', [assetAddress]),
                },
                {
                    target: addresses.mainnet.capAutomator,
                    callData: capAutomator.interface.encodeFunctionData('supplyCapConfigs', [assetAddress]),
                },
                {
                    target: addresses.mainnet.capAutomator,
                    callData: capAutomator.interface.encodeFunctionData('exec', [assetAddress]),
                },
            ],
        ]
    }

    let multicallResults = (await multicall.callStatic.aggregate(multicallCalls)).returnData

    for (const assetAddress of sparkAssets) {
        const reserveCaps = protocolDataProvider.interface.decodeFunctionResult('getReserveCaps', multicallResults[0])
        const borrowGap = BigInt(
            capAutomator.interface.decodeFunctionResult('borrowCapConfigs', multicallResults[1]).gap,
        )
        const supplyGap = BigInt(
            capAutomator.interface.decodeFunctionResult('supplyCapConfigs', multicallResults[2]).gap,
        )
        const execResult = capAutomator.interface.decodeFunctionResult('exec', multicallResults[3])

        multicallResults = multicallResults.slice(4)

        const proposedBorrowCapChange = execResult.newBorrowCap.gt(reserveCaps.borrowCap)
            ? execResult.newBorrowCap.sub(reserveCaps.borrowCap)
            : reserveCaps.borrowCap.sub(execResult.newBorrowCap)

        const proposedSupplyCapChange = execResult.newSupplyCap.gt(reserveCaps.supplyCap)
            ? execResult.newSupplyCap.sub(reserveCaps.supplyCap)
            : reserveCaps.supplyCap.sub(execResult.newSupplyCap)

        borrowCapUpdates[assetAddress] = proposedBorrowCapChange.gt(
            (borrowGap * (BigInt(10_000) - threshold)) / BigInt(10_000),
        )
        supplyCapUpdates[assetAddress] = proposedSupplyCapChange.gt(
            (supplyGap * (BigInt(10_000) - threshold)) / BigInt(10_000),
        )
    }

    const calls: Array<string> = []

    for (const assetAddress of sparkAssets) {
        if (borrowCapUpdates[assetAddress] && supplyCapUpdates[assetAddress]) {
            calls.push(capAutomator.interface.encodeFunctionData('exec', [assetAddress]))
        } else if (borrowCapUpdates[assetAddress]) {
            calls.push(capAutomator.interface.encodeFunctionData('execBorrow', [assetAddress]))
        } else if (supplyCapUpdates[assetAddress]) {
            calls.push(capAutomator.interface.encodeFunctionData('execSupply', [assetAddress]))
        }
    }

    if (calls.length == 0) {
        return {
            canExec: false,
            message: 'No cap automator calls to be executed',
        }
    }

    return {
        canExec: true,
        callData: calls.map((call) => ({
            to: addresses.mainnet.capAutomator,
            data: call,
        })),
    }
})
