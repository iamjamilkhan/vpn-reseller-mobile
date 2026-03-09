const { withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

const withNetworkSecurityConfig = (config) => {
  return withDangerousMod(config, [
    'android',
    async (config) => {
      const resXmlPath = path.join(
        config.modRequest.platformProjectRoot,
        'app/src/main/res/xml'
      );
      
      fs.mkdirSync(resXmlPath, { recursive: true });
      
      const configFilePath = path.join(resXmlPath, 'network_security_config.xml');
      
      const xmlContent = `<?xml version="1.0" encoding="utf-8"?>
<network-security-config>
    <base-config cleartextTrafficPermitted="true">
        <trust-anchors>
            <certificates src="system" />
            <certificates src="user" />
        </trust-anchors>
    </base-config>
</network-security-config>`;

      fs.writeFileSync(configFilePath, xmlContent);
      return config;
    },
  ]);
};

module.exports = withNetworkSecurityConfig;
