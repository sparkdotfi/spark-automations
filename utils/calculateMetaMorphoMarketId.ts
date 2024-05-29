import { utils } from 'ethers'

export const calculateMetaMorphoMarketId = (
    loanToken: string,
    collateralToken: string,
    oracle: string,
    irm: string,
    lltv: string,
): string => {
    return utils.keccak256(
        utils.defaultAbiCoder.encode(
            ['address', 'address', 'address', 'address', 'uint256'],
            [loanToken, collateralToken, oracle, irm, lltv],
        ),
    )
}
