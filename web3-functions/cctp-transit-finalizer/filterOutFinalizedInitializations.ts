import { StaticJsonRpcProvider } from '@ethersproject/providers'
import { Contract } from 'ethers'

import { messageTransmitterAbi, multicallAbi } from '../../abis'
import { CctpTransitInitialization } from '.'
import { computeCctpNonceAndSourceHash } from './computeCctpNonceAndSourceHash'

interface SelectOnlyNonFinalizedInitializationsArgs {
    initializations: CctpTransitInitialization[]
    multicallAddress: string
    messageTransmitterAddress: string
}

export async function filterOutFinalizedInitializations(
    provider: StaticJsonRpcProvider,
    args: SelectOnlyNonFinalizedInitializationsArgs,
): Promise<CctpTransitInitialization[]> {
    const multicall = new Contract(args.multicallAddress, multicallAbi, provider)
    const messageTransmitter = new Contract(args.messageTransmitterAddress, messageTransmitterAbi, provider)
    const multicallCalls = [
        ...args.initializations.map((event) => ({
            target: messageTransmitter.address,
            callData: messageTransmitter.interface.encodeFunctionData('usedNonces', [
                computeCctpNonceAndSourceHash(event.nonce, event.sourceDomain),
            ]),
        })),
    ]

    const multicallResults = (await multicall.callStatic.aggregate(multicallCalls)).returnData

    return args.initializations.filter((_, index) => {
        const [used] = messageTransmitter.interface.decodeFunctionResult('usedNonces', multicallResults[index])
        return !used
    })
}
