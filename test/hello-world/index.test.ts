import hre from 'hardhat'
import { expect } from 'chai'
import { before } from 'mocha'
import { Web3FunctionHardhat } from '@gelatonetwork/web3-functions-sdk/hardhat-plugin'
const { deployments, w3f } = hre

describe('HelloWorld', function () {
    let helloWorld: Web3FunctionHardhat

    before(async function () {
        await deployments.fixture()

        helloWorld = w3f.get('hello-world')
    })

    it('canExec returns true', async () => {
        const { result } = await helloWorld.run('onRun')

        expect(result.canExec).to.equal(true)
    })
})
