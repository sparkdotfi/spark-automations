import axios from 'axios'
import MockAdapter from 'axios-mock-adapter'
import { expect } from 'chai'

import { sendMessageToSlack } from '../../utils'

describe('sendMessageToSlack', function () {
    let mockAxios: MockAdapter

    before(() => {
        mockAxios = new MockAdapter(axios)
    })

    after(() => {
        mockAxios.reset()
    })

    it('correctly sends the message', async () => {
        sendMessageToSlack(axios, 'fakeSlackWebhookUrl')('text message 0')
        sendMessageToSlack(axios, 'fakeSlackWebhookUrl')('text message 1')
        sendMessageToSlack(axios, 'fakeSlackWebhookUrl')('text message 2')

        const sentPostRequests = mockAxios.history.post

        expect(sentPostRequests).to.have.length(3)

        expect(sentPostRequests[0].url).to.equal('fakeSlackWebhookUrl')
        expect(sentPostRequests[0].data).to.equal(JSON.stringify({ text: 'text message 0' }))

        expect(sentPostRequests[1].url).to.equal('fakeSlackWebhookUrl')
        expect(sentPostRequests[1].data).to.equal(JSON.stringify({ text: 'text message 1' }))

        expect(sentPostRequests[2].url).to.equal('fakeSlackWebhookUrl')
        expect(sentPostRequests[2].data).to.equal(JSON.stringify({ text: 'text message 2' }))
    })
})
