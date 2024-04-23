import axios from 'axios'
import MockAdapter from 'axios-mock-adapter'
import { expect } from 'chai'

import { formatDateArguments, gasAboveAverage } from '../../web3-functions/cap-automator/gasAboveAverage'

describe('gasAboveAverage', function () {
    const gwei = BigInt(10 ** 9)
    const mockAxios = new MockAdapter(axios)

    mockAxios.onGet().reply(200, {
        status: '1',
        message: 'OK',
        result: [
            {
                UTCDate: '2024-04-03',
                unixTimeStamp: '1712181600',
                maxGasPrice_Wei: '600000000000', // 600 gwei
                minGasPrice_Wei: '4000000000', // 4 gwei
                avgGasPrice_Wei: '10000000000', // 10 gwei
            },
            {
                UTCDate: '2024-04-04',
                unixTimeStamp: '1712181600',
                maxGasPrice_Wei: '600000000000', // 600 gwei
                minGasPrice_Wei: '4000000000', // 4 gwei
                avgGasPrice_Wei: '20000000000', // 20 gwei
            },
        ],
    })

    it('gas price is above average', async () => {
        const currentGasPrice = BigInt(17) * gwei
        const result = await gasAboveAverage(axios, 'fakeApiKey', currentGasPrice)()
        expect(result).to.be.true
    })

    it('gas price is below average', async () => {
        const currentGasPrice = BigInt(12) * gwei
        const result = await gasAboveAverage(axios, 'fakeApiKey', currentGasPrice)()
        expect(result).to.be.false
    })

    describe('formatDateArguments', () => {
        it('2024-04-22', () => {
            expect(formatDateArguments(new Date(1713787000000))).to.deep.equal({
                today: '2024-04-22',
                yesterday: '2024-04-21',
            })
        })

        it('2023-02-13', () => {
            expect(formatDateArguments(new Date(1676293000000))).to.deep.equal({
                today: '2023-02-13',
                yesterday: '2023-02-12',
            })
        })
    })
})
