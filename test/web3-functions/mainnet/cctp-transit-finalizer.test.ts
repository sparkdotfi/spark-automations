import hre from 'hardhat'
import { fetchInitializationEvents } from '../../../web3-functions/cctp-transit-finalizer/fetchInitializationEvents'

describe.only('CCTP Transit Finalizer', () => {

    describe('fetchInitializationEvents', () => {
        it('test', async () => {
            await fetchInitializationEvents(hre.ethers.provider, {
                fromBlock: 21158520,
                toBlock: 21158522,
                almControllerAddress: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
            })
        })
    })
})
