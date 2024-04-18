import { Contract } from '@ethersproject/contracts'
import { Web3Function, Web3FunctionContext } from '@gelatonetwork/web3-functions-sdk'

import { capAutomatorAbi, multicallAbi, poolAbi, protocolDataProviderAbi } from '../../abis'
import { addresses } from '../../utils'

type MulticallCall = {
    target: string,
    callData: string,
}

Web3Function.onRun(async (context: Web3FunctionContext) => {
    const { multiChainProvider, userArgs } = context
    const provider = multiChainProvider.default()
    const threshold = BigInt(userArgs.threshold as number)

    const pool = new Contract(addresses.mainnet.pool, poolAbi, provider)
    const protocolDataProvider = new Contract(addresses.mainnet.protocolDataProvider, protocolDataProviderAbi, provider)
    const capAutomator = new Contract(addresses.mainnet.capAutomator, capAutomatorAbi, provider)
    const multicall = new Contract(addresses.mainnet.multicall, multicallAbi, provider)

    const sparkAssets = (await pool.getReservesList()) as string[]

    const borrowCapUpdates = {} as Record<string, boolean>
    const supplyCapUpdates = {} as Record<string, boolean>

    let multicallCalls: Array<MulticallCall> = []

    for (const assetAddress of sparkAssets) {
        multicallCalls = [...multicallCalls, ...[
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
        ]]
    }
    let multicallResults = (await multicall.callStatic.aggregate(multicallCalls)).returnData

    for (const assetAddress of sparkAssets) {
        const reserveCaps = protocolDataProvider.interface.decodeFunctionResult('getReserveCaps', multicallResults[0])
        const borrowCapConfig = capAutomator.interface.decodeFunctionResult('borrowCapConfigs', multicallResults[1])
        const supplyCapConfig = capAutomator.interface.decodeFunctionResult('supplyCapConfigs', multicallResults[2])
        const execResult = capAutomator.interface.decodeFunctionResult('exec', multicallResults[3])

        multicallResults = multicallResults.slice(4)

        const borrowGap = BigInt(borrowCapConfig.gap)
        const supplyGap = BigInt(supplyCapConfig.gap)

        const proposedBorrowCap = execResult.newBorrowCap
        const currentBorrowCap = reserveCaps.borrowCap
        const proposedBorrowCapChange = proposedBorrowCap.gt(currentBorrowCap)
            ? proposedBorrowCap.sub(currentBorrowCap)
            : currentBorrowCap.sub(proposedBorrowCap)

        const proposedSupplyCap = execResult.newSupplyCap
        const currentSupplyCap = reserveCaps.supplyCap
        const proposedSupplyCapChange = proposedSupplyCap.gt(currentSupplyCap)
            ? proposedSupplyCap.sub(currentSupplyCap)
            : currentSupplyCap.sub(proposedSupplyCap)

        borrowCapUpdates[assetAddress] = proposedBorrowCapChange.gt(borrowGap * (BigInt(10_000) - threshold) / BigInt(10_000))
        supplyCapUpdates[assetAddress] = proposedSupplyCapChange.gt(supplyGap * (BigInt(10_000) - threshold) / BigInt(10_000))

    }

    const execBorrow = []
    const execSupply = []
    const exec = []

    for (const assetAddress of sparkAssets) {
        if (borrowCapUpdates[assetAddress] && supplyCapUpdates[assetAddress]) {
            exec.push(assetAddress)
        } else if (borrowCapUpdates[assetAddress]) {
            execBorrow.push(assetAddress)
        } else if (supplyCapUpdates[assetAddress]) {
            execSupply.push(assetAddress)
        }
    }

    const calls = [
        ...execBorrow.map((assetAddress) => capAutomator.interface.encodeFunctionData('execBorrow', [assetAddress])),
        ...execSupply.map((assetAddress) => capAutomator.interface.encodeFunctionData('execSupply', [assetAddress])),
        ...exec.map((assetAddress) => capAutomator.interface.encodeFunctionData('exec', [assetAddress])),
    ]

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
