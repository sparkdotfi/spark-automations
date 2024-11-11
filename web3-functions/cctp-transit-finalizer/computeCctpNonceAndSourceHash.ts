import { ethers } from 'ethers'

export function computeCctpNonceAndSourceHash(nonce: number, sourceDomainCctpAlias: number): string {
    return ethers.utils.solidityKeccak256(['uint32', 'uint64'], [sourceDomainCctpAlias, nonce])
}
