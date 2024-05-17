import { Web3Function, Web3FunctionContext } from '@gelatonetwork/web3-functions-sdk'

Web3Function.onRun(async (_: Web3FunctionContext) => {
    return {
        canExec: false,
        message: 'Not implemented',
    }
})
