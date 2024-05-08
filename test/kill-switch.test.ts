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

    it('test', async () => {
        const { result } = await killSwitchW3F.run('onRun')

        expect(result.canExec).to.equal(false)
        !result.canExec && expect(result.message).to.equal('No oracles met threshold')
    })

    it.skip('test', async () => {
        const { result } = await killSwitchW3F.run('onRun')

        expect(result.canExec).to.equal(true)
    })
})
