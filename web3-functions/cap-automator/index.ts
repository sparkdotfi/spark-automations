import { Contract } from '@ethersproject/contracts'
import { Web3Function, Web3FunctionContext } from '@gelatonetwork/web3-functions-sdk'

import { capAutomatorAbi, erc20Abi, poolAbi, protocolDataProviderAbi } from '../../abis'
import { addresses } from '../../utils'

Web3Function.onRun(async (context: Web3FunctionContext) => {
    const { multiChainProvider, userArgs } = context
    const provider = multiChainProvider.default()
    const threshold = BigInt(userArgs.threshold as number)

    const pool = new Contract(addresses.mainnet.pool, poolAbi, provider)
    const protocolDataProvider = new Contract(addresses.mainnet.protocolDataProvider, protocolDataProviderAbi, provider)
    const capAutomator = new Contract(addresses.mainnet.capAutomator, capAutomatorAbi, provider)

    const sparkAssets = (await pool.getReservesList()) as string[]

    const borrowCapUpdates = {} as Record<string, boolean>
    const supplyCapUpdates = {} as Record<string, boolean>

    for (const assetAddress of sparkAssets) {
        const asset = new Contract(assetAddress, erc20Abi, provider)
        const decimals = (await asset.decimals()) as number

        const reserveCaps = await protocolDataProvider.getReserveCaps(assetAddress)

        const borrowGap = BigInt((await capAutomator.borrowCapConfigs(assetAddress)).gap)

        if (borrowGap) {
            const borrowCap = BigInt(reserveCaps.borrowCap)
            const currentBorrow = BigInt(await protocolDataProvider.getTotalDebt(assetAddress)) / BigInt(10 ** decimals)
            const currentBorrowGap = borrowCap - currentBorrow

            borrowCapUpdates[assetAddress] = currentBorrowGap < (borrowGap * threshold) / BigInt(10000)
        } else {
            borrowCapUpdates[assetAddress] = false
        }

        const supplyGap = BigInt((await capAutomator.supplyCapConfigs(assetAddress)).gap)

        if (supplyGap) {
            const supplyCap = BigInt(reserveCaps.supplyCap)
            const currentSupply =
                BigInt(await protocolDataProvider.getATokenTotalSupply(assetAddress)) / BigInt(10 ** decimals)
            const currentSupplyGap = supplyCap - currentSupply

            supplyCapUpdates[assetAddress] = currentSupplyGap < (supplyGap * threshold) / BigInt(10000)
        } else {
            supplyCapUpdates[assetAddress] = false
        }
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
