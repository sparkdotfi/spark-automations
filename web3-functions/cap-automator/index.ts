import { Contract } from '@ethersproject/contracts'
import { Web3Function, Web3FunctionContext } from '@gelatonetwork/web3-functions-sdk'
import axios from 'axios'
import { utils } from 'ethers'

import { capAutomatorAbi, erc20Abi, multicallAbi, poolAbi, protocolDataProviderAbi } from '../../abis'
import { addresses, formatThousandSeparators, gasAboveAverage, sendMessageToSlack } from '../../utils'

Web3Function.onRun(async (context: Web3FunctionContext) => {
    const { multiChainProvider, userArgs, gelatoArgs, secrets } = context

    const performGasCheck = userArgs.performGasCheck as boolean
    const sendSlackMessages = userArgs.sendSlackMessages as boolean
    const currentGasPrice = BigInt(gelatoArgs.gasPrice.toString())

    const etherscanApiKey = (await secrets.get('ETHERSCAN_API_KEY')) as string
    const slackWebhookUrl = (await secrets.get('SLACK_WEBHOOK_URL')) as string

    if (performGasCheck && (await gasAboveAverage(axios, etherscanApiKey, currentGasPrice)())) {
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

    const erc20Interface = new utils.Interface(erc20Abi)

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
                {
                    target: assetAddress,
                    callData: erc20Interface.encodeFunctionData('symbol'),
                },
            ],
        ]
    }

    let multicallResults = (await multicall.callStatic.aggregate(multicallCalls)).returnData

    const assetSymbols = {} as Record<string, string>
    const messages: Array<string> = []

    for (const assetAddress of sparkAssets) {
        const reserveCaps = protocolDataProvider.interface.decodeFunctionResult('getReserveCaps', multicallResults[0])
        const borrowGap = BigInt(
            capAutomator.interface.decodeFunctionResult('borrowCapConfigs', multicallResults[1]).gap,
        )
        const supplyGap = BigInt(
            capAutomator.interface.decodeFunctionResult('supplyCapConfigs', multicallResults[2]).gap,
        )
        const execResult = capAutomator.interface.decodeFunctionResult('exec', multicallResults[3])

        assetSymbols[assetAddress] = erc20Interface.decodeFunctionResult('symbol', multicallResults[4])[0]

        multicallResults = multicallResults.slice(5)

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

        if (borrowCapUpdates[assetAddress]) {
            const changeDirection = execResult.newBorrowCap.gt(reserveCaps.borrowCap) ? 'increase' : 'decrease'
            const oldCap = formatThousandSeparators(reserveCaps.borrowCap.toString())
            const newCap = formatThousandSeparators(execResult.newBorrowCap.toString())
            messages.push(`- ${assetSymbols[assetAddress]} borrow cap ${changeDirection} (${oldCap} -> ${newCap})`)
        }

        if (supplyCapUpdates[assetAddress]) {
            const changeDirection = execResult.newSupplyCap.gt(reserveCaps.supplyCap) ? 'increase' : 'decrease'
            const oldCap = formatThousandSeparators(reserveCaps.supplyCap.toString())
            const newCap = formatThousandSeparators(execResult.newSupplyCap.toString())
            messages.push(`- ${assetSymbols[assetAddress]} supply cap ${changeDirection} (${oldCap} -> ${newCap})`)
        }
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

    if (sendSlackMessages) {
        await sendMessageToSlack(
            axios,
            slackWebhookUrl,
        )(`\`\`\`🦾📈📉 Cap Automator Keeper 🦾📈📉\nCalls to execute:\n${messages.join('\n')}\`\`\``)
    }

    return {
        canExec: true,
        callData: calls.map((call) => ({
            to: addresses.mainnet.capAutomator,
            data: call,
        })),
    }
})
