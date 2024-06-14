import { AxiosInstance, AxiosResponse } from 'axios'

export const sendMessageToSlack =
    (axios: AxiosInstance, slackWebhookUrl: string) =>
    async (message: string): Promise<AxiosResponse<any, any> | null> => {
        let result: AxiosResponse<any, any> | null = null
        try {
            result = await axios.post(slackWebhookUrl, { text: message })
        } catch (_) {}
        return result
    }
