
import { Entity } from "@adamasvr/sdk";
import "./asset-type"

declare module "@adamasvr/sdk"{
export interface SceneGraph
{
    "@Display": {
        entityId: Entity,
        "@Preview": {
            entityId: Entity
        },
        "@Capture": {
            entityId: Entity
        }
    },
    "@Camera": {
        entityId: Entity,
        "@polaroid_camera": {
            entityId: Entity,
            "@Sketchfab_model": {
                entityId: Entity,
                "@root": {
                    entityId: Entity,
                    "@GLTF_SceneRootNode": {
                        entityId: Entity,
                        "@Empty_18": {
                            entityId: Entity,
                            "@2_0": {
                                entityId: Entity,
                                "@Object_5": {
                                    entityId: Entity
                                },
                                "@Object_6": {
                                    entityId: Entity
                                }
                            },
                            "@BotonFlash_1": {
                                entityId: Entity,
                                "@Object_9": {
                                    entityId: Entity
                                },
                                "@Object_8": {
                                    entityId: Entity
                                }
                            },
                            "@CarcasaBlanca_2": {
                                entityId: Entity,
                                "@Object_12": {
                                    entityId: Entity
                                },
                                "@Object_13": {
                                    entityId: Entity
                                },
                                "@Object_14": {
                                    entityId: Entity
                                },
                                "@Object_11": {
                                    entityId: Entity
                                }
                            },
                            "@CarcasaNegra_3": {
                                entityId: Entity,
                                "@Object_16": {
                                    entityId: Entity
                                },
                                "@Object_17": {
                                    entityId: Entity
                                },
                                "@Object_18": {
                                    entityId: Entity
                                },
                                "@Object_20": {
                                    entityId: Entity
                                },
                                "@Object_19": {
                                    entityId: Entity
                                }
                            },
                            "@Colores_4": {
                                entityId: Entity,
                                "@Object_22": {
                                    entityId: Entity
                                },
                                "@Object_23": {
                                    entityId: Entity
                                },
                                "@Object_24": {
                                    entityId: Entity
                                },
                                "@Object_25": {
                                    entityId: Entity
                                },
                                "@Object_26": {
                                    entityId: Entity
                                }
                            },
                            "@Cube_5": {
                                entityId: Entity,
                                "@Object_28": {
                                    entityId: Entity
                                }
                            },
                            "@Cube001_6": {
                                entityId: Entity,
                                "@Object_30": {
                                    entityId: Entity
                                }
                            },
                            "@Cube003_7": {
                                entityId: Entity,
                                "@Object_32": {
                                    entityId: Entity
                                }
                            },
                            "@Cylinder_8": {
                                entityId: Entity,
                                "@Object_34": {
                                    entityId: Entity
                                }
                            },
                            "@InterruptorAmarillo_9": {
                                entityId: Entity,
                                "@Object_36": {
                                    entityId: Entity
                                }
                            },
                            "@InterruptorEncendido_10": {
                                entityId: Entity,
                                "@Object_38": {
                                    entityId: Entity
                                }
                            },
                            "@InterruptorNegro_11": {
                                entityId: Entity,
                                "@Object_40": {
                                    entityId: Entity
                                }
                            },
                            "@Lente_12": {
                                entityId: Entity,
                                "@Object_42": {
                                    entityId: Entity
                                }
                            },
                            "@Logo_13": {
                                entityId: Entity,
                                "@Object_44": {
                                    entityId: Entity
                                }
                            },
                            "@Objetivo_14": {
                                entityId: Entity,
                                "@Object_46": {
                                    entityId: Entity
                                },
                                "@Object_47": {
                                    entityId: Entity
                                },
                                "@Object_48": {
                                    entityId: Entity
                                }
                            },
                            "@off_15": {
                                entityId: Entity,
                                "@Object_50": {
                                    entityId: Entity
                                }
                            },
                            "@Plane002_16": {
                                entityId: Entity,
                                "@Object_52": {
                                    entityId: Entity
                                }
                            },
                            "@type_17": {
                                entityId: Entity,
                                "@Object_54": {
                                    entityId: Entity
                                }
                            }
                        }
                    }
                }
            }
        },
        "@Film": {
            entityId: Entity
        }
    }
}
}

export {}
