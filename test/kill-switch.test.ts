import hre from 'hardhat'
import { expect } from 'chai'
import { Contract } from '@ethersproject/contracts'
import { Web3FunctionHardhat } from '@gelatonetwork/web3-functions-sdk/hardhat-plugin'
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'
import { SnapshotRestorer, takeSnapshot } from '@nomicfoundation/hardhat-network-helpers'

import { multicallAbi } from '../abis'
import { addresses } from '../utils'

const { w3f, ethers } = hre

describe.only('KillSwitch', function () {
    this.timeout(0)

    let snapshotRestorer: SnapshotRestorer

    let killSwitchW3F: Web3FunctionHardhat
    let reader: SignerWithAddress
    let keeper: SignerWithAddress

    let multicall: Contract

    before(async () => {
        ;[reader, keeper] = await ethers.getSigners()

        killSwitchW3F = w3f.get('kill-switch')

        multicall = new Contract(addresses.mainnet.multicall, multicallAbi, reader)
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

    it.skip('one oracle meets the threshold', async () => {
        // Add a new oracle to the kill switch oracle contract with threshold under the price

        const { result } = await killSwitchW3F.run('onRun')

        expect(result.canExec).to.equal(true)

        // Check that returned calldata matches desired calldata (call KSO with the new oracle address)
        // Execute the call, check that the state of the KSO was changed to triggered
    })

    it.skip('multiple oracles meet the threshold', async () => {
        // Add two new oracles to the kill switch oracle contract with threshold under the price

        const { result } = await killSwitchW3F.run('onRun')

        expect(result.canExec).to.equal(true)

        // Check that returned calldata matches desired calldata (call KSO with the first of the new oracles address)
        // Execute the call, check that the state of the KSO was changed to triggered
    })
})
