
import { Entity } from "@adamasvr/sdk";
import "./asset-type"

declare module "@adamasvr/sdk"{
export interface SceneGraph
{
    "@AlphaBlendModeTest": {
        entityId: Entity,
        "@DecalOpaque": {
            entityId: Entity
        },
        "@TestBlend": {
            entityId: Entity
        },
        "@TestOpaque": {
            entityId: Entity
        },
        "@GreenArrows": {
            entityId: Entity
        },
        "@DecalBlend": {
            entityId: Entity
        },
        "@TestCutoff75": {
            entityId: Entity
        },
        "@TestCutoffDefault": {
            entityId: Entity
        },
        "@TestCutoff25": {
            entityId: Entity
        },
        "@Bed": {
            entityId: Entity
        }
    }
}
}

export {}
