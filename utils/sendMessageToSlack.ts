import { AxiosInstance } from 'axios'

export const sendMessageToSlack = (axios: AxiosInstance, slackWebhookUrl: string) => async (message: string) => {
    return axios.post(slackWebhookUrl, { text: message })
}
