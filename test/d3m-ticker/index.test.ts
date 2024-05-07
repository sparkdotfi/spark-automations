import hre from 'hardhat'
import { expect } from 'chai'
import { Contract } from '@ethersproject/contracts'
import { Web3FunctionHardhat } from '@gelatonetwork/web3-functions-sdk/hardhat-plugin'
import { Web3FunctionResultCallData } from '@gelatonetwork/web3-functions-sdk/*'
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'
import { SnapshotRestorer, takeSnapshot } from '@nomicfoundation/hardhat-network-helpers'

import { d3mHubAbi, multicallAbi, vatAbi } from '../../abis'
import { addresses, ilk } from '../../utils'

const { w3f, ethers } = hre

describe('d3mTicker', function () {
    this.timeout(0)

    let snapshotRestorer: SnapshotRestorer

    let d3mTickerW3F: Web3FunctionHardhat
    let reader: SignerWithAddress
    let keeper: SignerWithAddress

    let d3mHub: Contract
    let multicall: Contract
    let vat: Contract

    let artDifferenceOnTheFork: bigint

    let threshold: string
    let userArgs = { threshold: 0, performGasCheck: false }

    before(async () => {
        ;[reader, keeper] = await ethers.getSigners()

        d3mTickerW3F = w3f.get('d3m-ticker')

        d3mHub = new Contract(addresses.mainnet.d3mHub, d3mHubAbi, reader)
        multicall = new Contract(addresses.mainnet.multicall, multicallAbi, reader)
        vat = new Contract(addresses.mainnet.vat, vatAbi, reader)

        const [, artBefore] = await vat.urns(ilk, addresses.mainnet.d3mPool)

        const [, artAfterData] = (
            await multicall.callStatic.aggregate([
                {
                    target: addresses.mainnet.d3mHub,
                    callData: d3mHub.interface.encodeFunctionData('exec', [ilk]),
                },
                {
                    target: addresses.mainnet.vat,
                    callData: vat.interface.encodeFunctionData('urns', [ilk, addresses.mainnet.d3mPool]),
                },
            ])
        ).returnData
        const artAfter = vat.interface.decodeFunctionResult('urns', artAfterData).art

        artDifferenceOnTheFork =
            BigInt(artBefore) > BigInt(artAfter)
                ? BigInt(artBefore) - BigInt(artAfter)
                : BigInt(artAfter) - BigInt(artBefore)
    })

    beforeEach(async () => {
        snapshotRestorer = await takeSnapshot()
    })

    afterEach(async () => {
        await snapshotRestorer.restore()
    })

    it('threshold is not met', async () => {
        threshold = (artDifferenceOnTheFork + BigInt(1)).toString()
        const { result } = await d3mTickerW3F.run('onRun', { userArgs: { ...userArgs, threshold } })

        expect(result.canExec).to.equal(false)
        !result.canExec && expect(result.message).to.equal('Threshold not met')
    })

    it('threshold is met', async () => {
        threshold = (artDifferenceOnTheFork - BigInt(1)).toString()
        const { result } = await d3mTickerW3F.run('onRun', { userArgs: { ...userArgs, threshold } })

        expect(result.canExec).to.equal(true)

        if (!result.canExec) {
            throw ''
        }
        const callData = result.callData as Web3FunctionResultCallData[]

        expect(callData).to.deep.equal([
            {
                to: addresses.mainnet.d3mHub,
                data: d3mHub.interface.encodeFunctionData('exec', [ilk]),
            },
        ])

        const [, artBefore] = await vat.urns(ilk, addresses.mainnet.d3mPool)

        await keeper.sendTransaction({
            to: callData[0].to,
            data: callData[0].data,
        })

        const [, artAfter] = await vat.urns(ilk, addresses.mainnet.d3mPool)

        expect(artBefore).to.not.equal(artAfter)
    })
})
