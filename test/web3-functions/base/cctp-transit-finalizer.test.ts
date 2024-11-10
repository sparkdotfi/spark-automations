import hre from 'hardhat'
import { fetchInitializationEvents } from '../../../web3-functions/cctp-transit-finalizer/fetchInitializationEvents'

describe.only('CCTP Transit Finalizer', function() {
    this.timeout(0)

    describe('fetchInitializationEvents', () => {
        it('test', async () => {
            await fetchInitializationEvents(hre.ethers.provider, {
                fromBlock: 6915697,
                toBlock: 7031343,
                almControllerAddress: '0x61B989D473a977884Ac73A3726e1d2f7A6b50e07',
                destinationDomainCctpAlias: 0,
            })
        })
    })
})
