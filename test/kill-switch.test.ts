import hre from 'hardhat'
import { expect } from 'chai'
import { Contract } from '@ethersproject/contracts'
import { Web3FunctionHardhat } from '@gelatonetwork/web3-functions-sdk/hardhat-plugin'
import { Web3FunctionResultCallData } from '@gelatonetwork/web3-functions-sdk/*'
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'
import { SnapshotRestorer, impersonateAccount, takeSnapshot } from '@nomicfoundation/hardhat-network-helpers'

import { killSwitchOracleAbi, oracleAbi } from '../abis'
import { addresses } from '../utils'

const { w3f, ethers } = hre

describe('KillSwitch', function () {
    this.timeout(0)

    let snapshotRestorer: SnapshotRestorer

    let killSwitchW3F: Web3FunctionHardhat
    let reader: SignerWithAddress
    let keeper: SignerWithAddress

    let wbtcOracle: Contract
    let arbOracle: Contract

    let wbtcOracleLatestAnswer: bigint
    let arbOracleLatestAnswer: bigint

    const wbtcOracleAddress = '0xF4030086522a5bEEa4988F8cA5B36dbC97BeE88c' as const
    const arbOracleAddress = '0x31697852a68433DbCc2Ff612c516d69E3D9bd08F' as const
    const killSwitchOwnerAddress = '0x3300f198988e4C9C63F75dF86De36421f06af8c4' as const

    before(async () => {
        ;[reader, keeper] = await ethers.getSigners()

        killSwitchW3F = w3f.get('kill-switch')

        wbtcOracle = new Contract(wbtcOracleAddress, oracleAbi, reader)
        arbOracle = new Contract(arbOracleAddress, oracleAbi, reader)

        wbtcOracleLatestAnswer = BigInt((await wbtcOracle.latestAnswer()).toString())
        arbOracleLatestAnswer = BigInt((await arbOracle.latestAnswer()).toString())
    })

    beforeEach(async () => {
        snapshotRestorer = await takeSnapshot()
    })

    afterEach(async () => {
        await snapshotRestorer.restore()
    })

    it('no oracles meet the threshold', async () => {
        // No thresholds are met at the forked state
        const { result } = await killSwitchW3F.run('onRun')

        expect(result.canExec).to.equal(false)
        !result.canExec && expect(result.message).to.equal('No oracles met threshold')
    })

    it('one oracle meets the threshold', async () => {
        await impersonateAccount(killSwitchOwnerAddress)
        const owner = await hre.ethers.getSigner(killSwitchOwnerAddress)

        const killSwitchOracle = new Contract(addresses.mainnet.killSwitchOracle, killSwitchOracleAbi, owner)
        await killSwitchOracle.setOracle(arbOracleAddress, arbOracleLatestAnswer - BigInt(1)) // NOT meeting the threshold to call
        await killSwitchOracle.setOracle(wbtcOracleAddress, wbtcOracleLatestAnswer) // meeting the threshold to call

        const { result } = await killSwitchW3F.run('onRun')

        expect(result.canExec).to.equal(true)

        if (!result.canExec) {
            throw ''
        }
        const callData = result.callData as Web3FunctionResultCallData[]

        expect(callData).to.deep.equal([
            {
                to: addresses.mainnet.killSwitchOracle,
                data: killSwitchOracle.interface.encodeFunctionData('trigger', [wbtcOracleAddress]),
            },
        ])

        expect(await killSwitchOracle.triggered()).to.be.false

        await keeper.sendTransaction({
            to: callData[0].to,
            data: callData[0].data,
        })

        expect(await killSwitchOracle.triggered()).to.be.true
    })

    it('multiple oracles meet the threshold', async () => {
        await impersonateAccount(killSwitchOwnerAddress)
        const owner = await hre.ethers.getSigner(killSwitchOwnerAddress)

        const killSwitchOracle = new Contract(addresses.mainnet.killSwitchOracle, killSwitchOracleAbi, owner)
        await killSwitchOracle.setOracle(arbOracleAddress, arbOracleLatestAnswer) // meeting the threshold to call
        await killSwitchOracle.setOracle(wbtcOracleAddress, wbtcOracleLatestAnswer) // meeting the threshold to call

        const { result } = await killSwitchW3F.run('onRun')

        expect(result.canExec).to.equal(true)

        if (!result.canExec) {
            throw ''
        }
        const callData = result.callData as Web3FunctionResultCallData[]

        expect(callData).to.deep.equal([
            {
                to: addresses.mainnet.killSwitchOracle,
                data: killSwitchOracle.interface.encodeFunctionData('trigger', [arbOracleAddress]),
            },
        ])

        expect(await killSwitchOracle.triggered()).to.be.false

        await keeper.sendTransaction({
            to: callData[0].to,
            data: callData[0].data,
        })

        expect(await killSwitchOracle.triggered()).to.be.true
    })
})
