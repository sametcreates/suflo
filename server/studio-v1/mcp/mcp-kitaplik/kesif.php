<?php
declare(strict_types=1);
/*
 * Suflo Studio MCP kesif belgeleri. Hepsi tek yerden uretilir; issuer her belgede bayt bayt ayni.
 *   PRM (RFC 9728):       /.well-known/oauth-protected-resource/<uygulama>/mcp
 *   AS (RFC 8414):        /.well-known/oauth-authorization-server/<uygulama>
 *   OIDC bicimleri:       /.well-known/openid-configuration/<uygulama>, /<uygulama>/.well-known/openid-configuration
 *   (eski istemciler icin) /<uygulama>/.well-known/oauth-authorization-server
 */
if (!defined('SUFLO_MCP')) { http_response_code(404); exit; }

function mcp_prm(): array {
    return [
        'resource' => mcp_ortam('kaynak'),
        'authorization_servers' => [mcp_ortam('issuer')],
        'scopes_supported' => MCP_KAPSAMLAR,
        'bearer_methods_supported' => ['header'],
        'resource_name' => 'Suflo Studio',
    ];
}
function mcp_as_meta(): array {
    $yontemler = ['none', 'client_secret_post', 'client_secret_basic'];
    return [
        'issuer' => mcp_ortam('issuer'),
        'authorization_endpoint' => mcp_uc('authorize'),
        'token_endpoint' => mcp_uc('token'),
        'registration_endpoint' => mcp_uc('register'),
        'revocation_endpoint' => mcp_uc('revoke'),
        'response_types_supported' => ['code'],
        'response_modes_supported' => ['query'],
        'grant_types_supported' => ['authorization_code', 'refresh_token'],
        'code_challenge_methods_supported' => ['S256'],
        'token_endpoint_auth_methods_supported' => $yontemler,
        'revocation_endpoint_auth_methods_supported' => $yontemler,
        // offline_access: yenileme jetonu her zaman verilir; istenirse kabul edilir (PRM'de ve 401 basliginda yok)
        'scopes_supported' => array_merge(MCP_KAPSAMLAR, ['offline_access']),
        'authorization_response_iss_parameter_supported' => true,
    ];
}
function mcp_kesif_calistir(): void {
    $cors = ['Access-Control-Allow-Origin: *'];
    if (mcp_yontem() === 'OPTIONS') {
        mcp_bos(204, array_merge($cors, ['Access-Control-Allow-Methods: GET', 'Access-Control-Allow-Headers: MCP-Protocol-Version', 'Access-Control-Max-Age: 600']));
    }
    if (mcp_yontem() !== 'GET' && mcp_yontem() !== 'HEAD') mcp_json(405, ['error' => 'method_not_allowed'], ['Allow: GET, HEAD']);
    if (!mcp_acik_mi()) mcp_json(503, ['error' => 'temporarily_unavailable', 'error_description' => 'Suflo Studio MCP kapali.']);
    $u = preg_quote(mcp_ortam('uygulama'), '#');
    $yol = mcp_yol();
    if (preg_match('#^/\.well-known/oauth-protected-resource/' . $u . '/mcp$#', $yol)) mcp_json(200, mcp_prm(), $cors);
    if (preg_match('#^(/\.well-known/(oauth-authorization-server|openid-configuration)/' . $u . '|/' . $u . '/\.well-known/(openid-configuration|oauth-authorization-server))$#', $yol)) {
        mcp_json(200, mcp_as_meta(), $cors);
    }
    mcp_json(404, ['error' => 'not_found']);
}
