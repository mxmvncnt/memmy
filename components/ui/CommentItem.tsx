import React, {useRef, useState} from "react";
import {Divider, HStack, Icon, Pressable, Text, useTheme, useToast, View, VStack} from "native-base";
import ILemmyComment from "../../lemmy/types/ILemmyComment";
import {Dimensions, StyleSheet} from "react-native";
import {Ionicons} from "@expo/vector-icons";
import moment from "moment";
import {truncateName} from "../../helpers/TextHelper";
import {depthToColor} from "../../helpers/ColorHelper";
import {GestureHandlerRootView, PanGestureHandler,} from "react-native-gesture-handler";
import {useAppDispatch, useAppSelector} from "../../store";
import Animated, {
    runOnJS,
    useAnimatedGestureHandler,
    useAnimatedStyle,
    useSharedValue,
    withSpring
} from "react-native-reanimated";
import {setResponseTo} from "../../slices/newComment/newCommentSlice";
import {lemmyAuthToken, lemmyInstance} from "../../lemmy/LemmyInstance";
import {useNavigation} from "@react-navigation/native";
import {NativeStackNavigationProp} from "@react-navigation/native-stack";
import {getBaseUrl} from "../../helpers/LinkHelper";
import {selectSettings} from "../../slices/settings/settingsSlice";
import RenderMarkdown from "./markdown/RenderMarkdown";
import { onVoteHapticFeedback } from "../../helpers/HapticFeedbackHelpers";

interface CommentItemProps {
    comment: ILemmyComment,
    depth?: number,
}

const CommentItem = ({comment, depth = 1}: CommentItemProps) => {
    const navigation = useNavigation<NativeStackNavigationProp<any>>();

    const lastCommentId = useRef(comment.top.comment.id);

    const [collapsed, setCollapsed] = useState(false);
    const [myVote, setMyVote] = useState(comment.top.my_vote);

    const dispatch = useAppDispatch();
    const theme = useTheme();
    const toast = useToast();

    const {showInstanceForUsernames} = useAppSelector(selectSettings);

    if(comment.top.comment.id !== lastCommentId.current) {
        lastCommentId.current = comment.top.comment.id;
        setCollapsed(false);
        setMyVote(comment.top.my_vote);
    }

    const onVote = async (value: -1 | 0 | 1) => {
        if(value === myVote && value !== 0) value = 0;

        const oldValue = comment.top.my_vote;

        setMyVote(value);

        try {
            await lemmyInstance.likeComment({
                auth: lemmyAuthToken,
                comment_id: comment.top.comment.id,
                score: value
            });
        } catch(e) {
            toast.show({
                title: "Error submitting vote...",
                duration: 3000
            });
            setMyVote(oldValue as -1|0|1);
            return;
        }
    };

    // Gesture Logic

    const width = Dimensions.get("screen").width;

    const [color, setColor] = useState("#1abd3e");
    const [iconName, setIconName] = useState("");

    const translateX = useSharedValue(0);
    const ranFeedbackUpvote = useSharedValue(false);
    const ranFeedbackDownvote = useSharedValue(false);
    const ranFeedbackComment = useSharedValue(false);
    const startPos = useSharedValue(0);
    const action = useSharedValue<null|"upvote"|"downvote"|"comment"|"back">(null);

    const gestureHandler = useAnimatedGestureHandler({
        onStart: (event, ctx) => {
            // eslint-disable-next-line @typescript-eslint/ban-ts-comment
            // @ts-ignore
            ctx.startX = translateX.value;
            startPos.value = event.absoluteX;
        },
        onActive: (event, ctx) => {
            // eslint-disable-next-line @typescript-eslint/ban-ts-comment
            // @ts-ignore
            translateX.value = ctx.startX + event.translationX;

            if(event.translationX > 0) {
                if(event.translationX < width * .40) {
                    runOnJS(setStyles)("upvote");
                } else {
                    runOnJS(setStyles)("downvote");
                }
            } else {
                runOnJS(setStyles)("comment");
            }

            if(event.translationX >= width * .20 && !ranFeedbackUpvote.value) {
                // runOnJS(trigger)("impactHeavy");
                onVoteHapticFeedback()
                ranFeedbackUpvote.value = true;
            } else if(event.translationX >= width * .40 && !ranFeedbackDownvote.value) {
                // runOnJS(trigger)("impactHeavy");
                onVoteHapticFeedback()
                ranFeedbackDownvote.value = true;
            } else if(event.translationX <= -(width * .2) && !ranFeedbackComment.value) {
                // runOnJS(trigger)("impactHeavy");
                onVoteHapticFeedback()
                ranFeedbackComment.value = true;
            }
        },
        onEnd: (event) => {
            ranFeedbackUpvote.value = false;
            ranFeedbackDownvote.value = false;
            ranFeedbackComment.value = false;

            runOnJS(setStyles)("upvote");

            if(startPos.value < 10) {
                runOnJS(onDone)("back");
                action.value = "back";
            } else if (event.translationX >= width * .20 && event.translationX < width * .40) {
                runOnJS(onDone)("upvote");
            } else if (event.translationX >= width * .40) {
                runOnJS(onDone)("downvote");
            } else if (event.translationX <= -(width * .20)) {
                runOnJS(onDone)("comment");
            }

            translateX.value = withSpring(0, {
                damping: 40
            });
        },
    });

    const animatedStyle = useAnimatedStyle(() => {
        return {
            transform: [{ translateX: translateX.value }],
        };
    });

    function setStyles(action: "upvote" | "downvote" | "comment") {
        switch(action) {
            case "upvote": {
                setColor("#1abd3e");
                setIconName("arrow-up-outline");
                break;
            }
            case "downvote": {
                setColor("#e36919");
                setIconName("arrow-down-outline");
                break;
            }
            case "comment": {
                setColor("#007AFF");
            }
        }
    }

    function onDone(action: null|"upvote"|"downvote"|"comment"|"back") {
        switch (action) {
            case "upvote": {
                onVote(1);
                break;
            }
            case "downvote": {
                onVote(-1);
                break;
            }
            case "comment": {
                dispatch(setResponseTo({
                    comment: comment.top
                }));
                navigation.push("NewComment");
                break;
            }
            case "back": {
                navigation.pop();
                break;
            }
        }
    }

    return (
        <GestureHandlerRootView style={{flex: 1}}>
            <View>
                <View style={styles.backgroundContainer}>
                    <View style={styles.backgroundLeft} justifyContent={"center"} backgroundColor={color}>
                        <Icon as={Ionicons} name={iconName} size={12} color={"white"} alignSelf={iconName === "arrow-undo" ? "flex-end" : "flex-start"} />
                    </View>
                    <View style={styles.backgroundLeft} backgroundColor={color}>

                    </View>
                    <View style={styles.backgroundRight} justifyContent={"center"} backgroundColor={"#007AFF"}>
                        <Icon as={Ionicons} name={"arrow-undo"} size={12} color={"white"} alignSelf={"flex-end"} />
                    </View>
                </View>

                <PanGestureHandler
                    onGestureEvent={gestureHandler}
                    minPointers={1}
                    activeOffsetX={[-10, 10]}
                    hitSlop={{left: -25}}
                >
                    <Animated.View style={[animatedStyle]}>
                        <VStack
                            flex={1}
                            py={1.5}
                            backgroundColor={"screen.800"}
                            style={{
                                paddingLeft: ((depth) * 8)
                            }}
                        >
                            <View style={[depth > 1 && styles.side, {borderLeftColor: depthToColor(depth)}]}>
                                <Pressable
                                    onPress={() => setCollapsed(!collapsed)}
                                >
                                    <VStack flex={1} space={1} alignItems={"flex-start"}>
                                        <Text fontWeight={"bold"}>
                                            {`${truncateName(comment.top.creator.name)}${showInstanceForUsernames ? `@${getBaseUrl(comment.top.creator.actor_id)}` : ""}`}
                                        </Text>
                                        <HStack space={3} alignItems={"center"}>
                                            <HStack space={0} alignItems={"center"}>
                                                <Icon
                                                    as={Ionicons}
                                                    name={myVote !== -1 ? "arrow-up-outline" : "arrow-down-outline"}
                                                    color={myVote === -1 ? "orange.500" : (myVote === 1 ? "green.500" : "gray.500")}
                                                />
                                                <Text
                                                    color={myVote === -1 ? "orange.500" : (myVote === 1 ? "green.500" : "gray.500")}
                                                >
                                                    {comment.top.counts.score + myVote}
                                                </Text>
                                            </HStack>
                                            <HStack space={1} alignItems={"center"}>
                                                <Icon as={Ionicons} name={"time-outline"} />
                                                <Text color={"gray.500"}>{moment(comment.top.comment.published).utc(true).fromNow()}</Text>
                                            </HStack>
                                        </HStack>
                                        {
                                            !collapsed ? (
                                                <Text>
                                                    {
                                                        (comment.top.comment.deleted || comment.top.comment.removed) ? (
                                                            <Text fontStyle={"italic"} color={"gray.500"}>Comment was deleted :(</Text>
                                                        ) : (
                                                            <VStack pr={2}>
                                                                <RenderMarkdown text={comment.top.comment.content} addImages={true} />
                                                            </VStack>
                                                        )
                                                    }
                                                </Text>
                                            ) : (
                                                <Text fontStyle={"italic"} color={"gray.500"}>
                                                    Comment collapsed
                                                </Text>
                                            )
                                        }
                                    </VStack>
                                </Pressable>
                            </View>
                        </VStack>
                    </Animated.View>
                </PanGestureHandler>
            </View>
            <Divider />
            <VStack>
                {
                    comment.replies.map((reply) => (
                        <View style={{display: collapsed ? "none" : "flex"}} key={reply.top.comment.id}>
                            <CommentItem comment={reply} depth={depth + 1} />
                        </View>
                    ))
                }
            </VStack>
        </GestureHandlerRootView>
    );
};

const styles = StyleSheet.create({
    side: {
        borderLeftWidth: 2,
        paddingLeft: 8,
        marginLeft: -4,
    },

    backgroundContainer: {
        ...StyleSheet.absoluteFillObject,
        flex: 1,
        flexDirection: "row"
    },

    backgroundLeft: {
        flex: 1,
    },

    backgroundRight: {
        flex: 1,
    }
});

export default CommentItem;