import { AxiosInstance } from 'axios'

const dayInMilliSeconds = 24 * 60 * 60 * 1000

export const formatDateArguments = (date: Date): { today: string; yesterday: string } => ({
    today: date.toISOString().slice(0, 10),
    //@ts-ignore
    yesterday: new Date(date - dayInMilliSeconds).toISOString().slice(0, 10),
})

export const gasAboveAverage =
    (axios: AxiosInstance, apiKey: string, currentGasPrice: bigint) => async (): Promise<boolean> => {
        const formattedDateArguments = formatDateArguments(new Date())

        const {
            data: { result },
        } = await axios.get(
            `https://api.etherscan.io/api?module=stats&action=dailyavggasprice&startdate=${formattedDateArguments.yesterday}&enddate=${formattedDateArguments.today}&sort=asc&apikey=${apiKey}`,
        )

        const averageGasPriceYesterday = BigInt(result[0].avgGasPrice_Wei)
        const averageGasPriceToday = BigInt(result[1].avgGasPrice_Wei)
        const averageGasPrice = (averageGasPriceYesterday + averageGasPriceToday) / BigInt(2)

        return currentGasPrice > averageGasPrice
    }
