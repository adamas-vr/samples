
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
    },
    "@MetalRoughSpheres": {
        entityId: Entity,
        "@New Entity": {
            entityId: Entity,
            "@Spheres001": {
                entityId: Entity
            },
            "@Spheres002": {
                entityId: Entity
            },
            "@Spheres003": {
                entityId: Entity
            },
            "@Spheres004": {
                entityId: Entity
            },
            "@Spheres": {
                entityId: Entity
            }
        }
    },
    "@NormalTangentTest": {
        entityId: Entity,
        "@New Entity": {
            entityId: Entity,
            "@NormalTangentTest_low": {
                entityId: Entity
            }
        }
    },
    "@TextureCoordinateTest": {
        entityId: Entity,
        "@BackPlane": {
            entityId: Entity
        },
        "@BottomRightObj": {
            entityId: Entity
        },
        "@BottomLeftObj": {
            entityId: Entity
        },
        "@TopRightObj": {
            entityId: Entity
        },
        "@TopLeftObj": {
            entityId: Entity
        }
    },
    "@TextureSettingsTest": {
        entityId: Entity,
        "@New Entity": {
            entityId: Entity,
            "@BackgroundMesh": {
                entityId: Entity
            },
            "@LabelMesh": {
                entityId: Entity
            },
            "@SingleSidedMesh": {
                entityId: Entity
            },
            "@DoubleSidedMesh": {
                entityId: Entity
            },
            "@TextureClampMeshS": {
                entityId: Entity
            },
            "@TextureRepeatMeshS": {
                entityId: Entity
            },
            "@TextureClampMeshT": {
                entityId: Entity
            },
            "@TextureRepeatMeshT": {
                entityId: Entity
            },
            "@TextureMirrorMeshS": {
                entityId: Entity
            },
            "@TextureMirrorMeshT": {
                entityId: Entity
            }
        }
    },
    "@WaterBottle": {
        entityId: Entity,
        "@WaterBottle": {
            entityId: Entity
        }
    },
    "@FlightHelmet": {
        entityId: Entity,
        "@Hose_low": {
            entityId: Entity
        },
        "@RubberWood_low": {
            entityId: Entity
        },
        "@GlassPlastic_low": {
            entityId: Entity
        },
        "@MetalParts_low": {
            entityId: Entity
        },
        "@LeatherParts_low": {
            entityId: Entity
        },
        "@Lenses_low": {
            entityId: Entity
        }
    }
}
}

export {}
