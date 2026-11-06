TARGET := iphone:clang:latest:14.0
ARCHS := arm64

include $(THEOS)/makefiles/common.mk

LIBRARY_NAME = RBXFFlags
RBXFFlags_FILES = Tweak.xm regmap.c
RBXFFlags_CFLAGS = -fobjc-arc
RBXFFlags_FRAMEWORKS = Foundation
RBXFFlags_LDFLAGS = -Xlinker -undefined -Xlinker dynamic_lookup

include $(THEOS_MAKE_PATH)/library.mk
