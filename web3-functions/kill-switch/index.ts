import { Contract } from '@ethersproject/contracts'
import { Web3Function, Web3FunctionContext } from '@gelatonetwork/web3-functions-sdk'

import { killSwitchOracleAbi, multicallAbi } from '../../abis'
import { addresses } from '../../utils'

Web3Function.onRun(async (context: Web3FunctionContext) => {
    const { multiChainProvider } = context

    const provider = multiChainProvider.default()

    const multicall = new Contract(addresses.mainnet.multicall, multicallAbi, provider)
    const killSwitchOracle = new Contract(addresses.mainnet.killSwitchOracle,killSwitchOracleAbi, provider)

    const oracles = await killSwitchOracle.oracles()

    console.log({oracles})
    console.log(multicall.address)

    return {
        canExec: false,
        message: 'No oracles met threshold',
    }
})
