import hre from 'hardhat'
import { expect } from 'chai'
import { Web3FunctionHardhat } from '@gelatonetwork/web3-functions-sdk/hardhat-plugin'
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'
import { SnapshotRestorer, impersonateAccount, takeSnapshot, mine } from '@nomicfoundation/hardhat-network-helpers'
import { Contract } from '@ethersproject/contracts'

import { capAutomatorAbi, erc20Abi, poolAbi, protocolDataProviderAbi } from '../../abis'
import { addresses } from '../../utils'
import { Web3FunctionResultCallData } from '@gelatonetwork/web3-functions-sdk/*'

const { w3f, ethers } = hre

describe('CapAutomator', function () {
    this.timeout(0)

    let snapshotRestorer: SnapshotRestorer

    let capAutomatorW3F: Web3FunctionHardhat
    let reader: SignerWithAddress
    let keeper: SignerWithAddress

    let capAutomator: Contract
    let protocolDataProvider: Contract
    let pool: Contract

    let sparkAssets: string[]

    const wbtc = '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599' as const

    const wbtcWhale = '0xb20Fb60E27a1Be799b5e04159eC2024CC3734eD7' as const

    const deposit = async (signerAddress: string, tokenAddress: string, amount: BigInt) => {
        await impersonateAccount(signerAddress)
        const signer = await hre.ethers.getSigner(signerAddress)

        const token = new Contract(tokenAddress, erc20Abi, signer)

        await token.approve(addresses.mainnet.pool, amount)

        const pool = new Contract(addresses.mainnet.pool, poolAbi, signer)
        await pool.supply(tokenAddress, amount, signerAddress, 0)
    }

    const formatExecSupplyCallData = (assetAddress: string) => `0xb00d4b1c000000000000000000000000${assetAddress.slice(2).toLocaleLowerCase()}`

    before(async () => {
        ;[reader, keeper] = await ethers.getSigners()

        pool = new Contract(addresses.mainnet.pool, poolAbi, reader)
        capAutomator = new Contract(addresses.mainnet.capAutomator, capAutomatorAbi, reader)
        protocolDataProvider = new Contract(addresses.mainnet.protocolDataProvider, protocolDataProviderAbi, reader)

        sparkAssets = await pool.getReservesList()

        for (const assetAddress of sparkAssets) {
            await capAutomator.exec(assetAddress)
        }

        await mine(2, {interval: 24 * 60 * 60 })

        capAutomatorW3F = w3f.get('cap-automator')
    })

    beforeEach(async () => {
        snapshotRestorer = await takeSnapshot()
    })

    afterEach(async () => {
        await snapshotRestorer.restore()
    })

    it('no cap updates are required', async () => {
        const { result } = await capAutomatorW3F.run('onRun')

        expect(result.canExec).to.equal(false)
        !result.canExec && expect(result.message).to.equal('No cap automator calls to be executed')
    })

    it('one supply cap update is required (90% threshold)', async () => {
        const { gap } = await capAutomator.supplyCapConfigs(wbtc)
        const amountInFullTokens = BigInt(gap) / BigInt(5)
        const amount = amountInFullTokens * BigInt(10**8)  // full tokens * WBTC decimals * 20%

        await deposit(wbtcWhale, wbtc, amount)

        // update for each gap that is smaller than 90% of the desired gap
        const { result } = await capAutomatorW3F.run('onRun', { userArgs: { threshold: 9000 } })

        expect(result.canExec).to.equal(true)
        if (!result.canExec) {throw ''}

        const callData = result.callData as Web3FunctionResultCallData[]

        expect(callData.length).to.equal(1)
        expect(callData[0].to).to.equal(addresses.mainnet.capAutomator)
        expect(callData[0].data).to.equal(formatExecSupplyCallData(wbtc))

        const supplyCapBefore = BigInt((await protocolDataProvider.getReserveCaps(wbtc)).supplyCap)

        await keeper.sendTransaction({
            to: callData[0].to,
            data: callData[0].data,
        })

        const supplyCapAfter = BigInt((await protocolDataProvider.getReserveCaps(wbtc)).supplyCap)

        expect(supplyCapAfter).to.equal(supplyCapBefore + amountInFullTokens)
    })
})
